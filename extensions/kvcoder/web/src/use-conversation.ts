import { onUnmounted, reactive, shallowReactive, shallowRef, watch, type ShallowRef } from 'vue';
import type { Kvman } from '@kvman/sdk/web';
import type { Message, Session, Turn } from '../../src/index.ts';
import { applyEvent, idleLive, type Live, type LiveCall } from './live-step.ts';

// A conversation's data (plan 08 §8.7): the session, its newest messages and turns, the running step streamed through
// `kvman.stream` (following each step's follow chunk), and the subagents it waits on. After a reload, the session's
// `stepJobId` reattaches to the running step. While nothing streams, the session is read again every few seconds, so a
// turn started elsewhere (a background result) shows up.

export type Child = { session: Session; turn: Turn | undefined; live: Live };

/** How full the model's window is (`kvcoder.context.get`). */
export type ContextSize = { tokens: number; window: number | null; compactAt: number };

export type Conversation = {
  session: ShallowRef<Session | null>;
  messages: ShallowRef<Message[]>;
  omitted: ShallowRef<number>;
  turns: ShallowRef<Turn[]>;
  context: ShallowRef<ContextSize | null>;
  /** What the last load of the messages failed with, if it did (ADR 0034, 10). */
  loadFailure: ShallowRef<unknown>;
  live: Live;
  streaming: ShallowRef<boolean>;
  children: Map<string, Child>;
  refresh(ran?: readonly LiveCall[]): Promise<void>;
  stream(jobId: string, ran?: readonly LiveCall[]): Promise<void>;
};

const pollMs = 5_000;
const pageSize = 200;

export function useConversation(kvman: Kvman, sessionId: () => string | undefined, failed: (error: unknown) => void): Conversation {
  const session = shallowRef<Session | null>(null);
  const messages = shallowRef<Message[]>([]);
  const omitted = shallowRef(0);
  const turns = shallowRef<Turn[]>([]);
  const context = shallowRef<ContextSize | null>(null);
  const loadFailure = shallowRef<unknown>(undefined);
  // The chat whose whole list is on the page; after that only what is new is asked for (ADR 0034, 8).
  let listed: string | undefined;
  const streaming = shallowRef(false);
  const live = reactive<Live>(idleLive());
  const children = shallowReactive(new Map<string, Child>());
  const following = new Set<string>();
  let closed = false;

  async function loadChildren(turn: Turn | undefined): Promise<void> {
    const ids = (turn?.pending ?? []).flatMap((item) => (item.childSessionId === null ? [] : [item.childSessionId]));
    for (const id of [...children.keys()]) if (!ids.includes(id)) children.delete(id);
    for (const id of ids) {
      const [child, [childTurn]] = await Promise.all([kvman.exec('kvcoder.session.get', { sessionId: id }), kvman.exec('kvcoder.turn.list', { sessionId: id, limit: 1 })]);
      children.set(id, { session: child, turn: childTurn, live: children.get(id)?.live ?? reactive(idleLive()) });
    }
  }

  const stored = (list: readonly Message[]): Message[] => list.filter((message) => message.queued !== true);

  async function loadAll(id: string, key: string): Promise<void> {
    const list = await kvman.exec('kvcoder.message.list', { sessionId: id, limit: pageSize });
    messages.value = list.messages;
    omitted.value = list.omitted;
    listed = key;
  }

  // Adds the messages stored since the page's last one. When they don't start at the next `seq`, more arrived than one
  // answer holds, so the whole list is loaded again.
  async function loadNew(id: string, key: string, afterSeq: number): Promise<void> {
    const list = await kvman.exec('kvcoder.message.list', { sessionId: id, limit: pageSize, afterSeq });
    const fresh = stored(list.messages);
    if (fresh[0] !== undefined && fresh[0].seq !== afterSeq + 1) return loadAll(id, key);
    const shown = stored(messages.value);
    const last = shown.at(-1)?.seq ?? afterSeq;
    messages.value = [...shown, ...fresh.filter((message) => (message.seq ?? last) > last), ...list.messages.filter((message) => message.queued === true)];
  }

  async function loadMessages(id: string): Promise<void> {
    const key = `${kvman.workspace.value.id}:${id}`;
    const last = listed === key ? stored(messages.value).at(-1)?.seq : undefined;
    try {
      await (last === undefined ? loadAll(id, key) : loadNew(id, key, last));
      loadFailure.value = undefined;
    } catch (error) {
      loadFailure.value = error;
    }
  }

  async function reload(): Promise<void> {
    const id = sessionId();
    if (id === undefined) return;
    const [found, recent, size] = await Promise.all([
      kvman.exec('kvcoder.session.get', { sessionId: id }),
      kvman.exec('kvcoder.turn.list', { sessionId: id, limit: 50 }),
      kvman.exec('kvcoder.context.get', { sessionId: id }),
    ]);
    // The status items count sessions by status, so they rerun when this one's changes (ADR 0009, 138).
    if (session.value !== null && session.value.status !== found.status) kvman.refresh();
    session.value = found;
    turns.value = recent;
    context.value = size;
    await loadMessages(id);
    await loadChildren(found.status === 'waiting' ? recent[0] : undefined);
  }

  // Streams a chain of steps into `target`, following each step's follow chunk; `after` runs when each step ends. `ran` are
  // the calls the person just approved: the first step runs them before it calls the model (ADR 0009, 142).
  async function streamChain(jobId: string, target: Live, after: () => Promise<string | undefined>, ran: readonly LiveCall[] = []): Promise<void> {
    let current: string | undefined = jobId;
    let carried = ran;
    while (current !== undefined && !closed && !following.has(current)) {
      following.add(current);
      Object.assign(target, idleLive());
      target.calls = carried.map((call) => ({ ...call, complete: true, carried: true }));
      carried = [];
      kvman.follow(current).catch(failed);
      let next: string | undefined;
      for await (const event of kvman.stream(current)) {
        const signal = applyEvent(target, event);
        if (signal.kind === 'follow') next = signal.jobId;
        if (signal.kind === 'subagent') streamChild(signal.sessionId, signal.jobId).catch(failed);
        if (signal.kind === 'question') reload().catch(failed);
      }
      following.delete(current);
      const fallback = await after();
      current = next ?? (fallback !== current ? fallback : undefined);
    }
    Object.assign(target, idleLive());
  }

  async function stream(jobId: string, ran: readonly LiveCall[] = []): Promise<void> {
    streaming.value = true;
    try {
      await streamChain(
        jobId,
        live,
        async () => {
          await reload();
          return session.value?.status === 'running' ? session.value.stepJobId : undefined;
        },
        ran,
      );
    } finally {
      streaming.value = following.size > 0;
    }
  }

  async function streamChild(childId: string, jobId: string): Promise<void> {
    await reload();
    const child = children.get(childId);
    if (child === undefined) return;
    await streamChain(jobId, child.live, async () => {
      const found = await kvman.exec('kvcoder.session.get', { sessionId: childId });
      return found.status === 'running' ? found.stepJobId : undefined;
    });
    await refresh();
  }

  async function refresh(ran: readonly LiveCall[] = []): Promise<void> {
    await reload();
    const current = session.value;
    if (current?.status === 'running' && current.stepJobId !== undefined) stream(current.stepJobId, ran).catch(failed);
    for (const [id, child] of children) if (child.session.status === 'running' && child.session.stepJobId !== undefined) streamChild(id, child.session.stepJobId).catch(failed);
  }

  const timer = setInterval(() => {
    if (following.size === 0 && sessionId() !== undefined) refresh().catch(failed);
  }, pollMs);
  onUnmounted(() => {
    closed = true;
    clearInterval(timer);
  });
  watch([sessionId, () => kvman.workspace.value.id], () => refresh().catch(failed), { immediate: true });
  return { session, messages, omitted, turns, context, loadFailure, live, streaming, children, refresh, stream };
}
