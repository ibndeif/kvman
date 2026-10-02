import { onUnmounted, reactive, shallowReactive, shallowRef, watch, type ShallowRef } from 'vue';
import type { Kvman } from '@kvman/sdk/web';
import type { Message, Session, Turn } from '../../src/index.ts';
import { applyEvent, idleLive, type Live, type LiveCall } from './live-step.ts';

// A conversation's data (plan 08 §8.7): the session, its newest messages and turns, the running step streamed through
// `kvman.stream` (following each step's follow chunk), and the subagents it waits on. After a reload, the session's
// `stepJobId` reattaches to the running step. While nothing streams, the session is read again every few seconds, so a
// turn started elsewhere (a background result) shows up.

export type Child = { session: Session; turn: Turn | undefined; live: Live };

export type Conversation = {
  session: ShallowRef<Session | null>;
  messages: ShallowRef<Message[]>;
  omitted: ShallowRef<number>;
  turns: ShallowRef<Turn[]>;
  live: Live;
  streaming: ShallowRef<boolean>;
  children: Map<string, Child>;
  refresh(ran?: readonly LiveCall[]): Promise<void>;
  stream(jobId: string, ran?: readonly LiveCall[]): Promise<void>;
};

const pollMs = 5_000;

export function useConversation(kvman: Kvman, sessionId: () => string | undefined, failed: (error: unknown) => void): Conversation {
  const session = shallowRef<Session | null>(null);
  const messages = shallowRef<Message[]>([]);
  const omitted = shallowRef(0);
  const turns = shallowRef<Turn[]>([]);
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

  async function reload(): Promise<void> {
    const id = sessionId();
    if (id === undefined) return;
    const [found, list, recent] = await Promise.all([
      kvman.exec('kvcoder.session.get', { sessionId: id }),
      kvman.exec('kvcoder.message.list', { sessionId: id, limit: 200 }),
      kvman.exec('kvcoder.turn.list', { sessionId: id, limit: 50 }),
    ]);
    // The status items count sessions by status, so they rerun when this one's changes (ADR 0009, 138).
    if (session.value !== null && session.value.status !== found.status) kvman.refresh();
    session.value = found;
    messages.value = list.messages;
    omitted.value = list.omitted;
    turns.value = recent;
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
  return { session, messages, omitted, turns, live, streaming, children, refresh, stream };
}
