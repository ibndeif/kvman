import { onUnmounted, reactive, shallowReactive, shallowRef, watch, type ShallowRef } from 'vue';
import type { Kvman } from '@kvman/sdk/web';
import type { Message, Session, Turn } from '../../src/index.ts';
import { idleLive, type Live, type LiveCall } from './live-step.ts';
import { conversationStreams } from './conversation-streams.ts';
import { reconcileQuestionDrafts } from './question-drafts.ts';
import { loadWaitingHelpers, type WaitingHelper } from './waiting-helpers.ts';

export type Child = { session: Session; turn: Turn | undefined; live: Live };
/** How full the model's window is (`kvcoder.context.get`). */
export type ContextSize = { tokens: number; window: number | null; compactAt: number; estimated?: boolean };
export type Conversation = {
  session: ShallowRef<Session | null>;
  messages: ShallowRef<Message[]>;
  omitted: ShallowRef<number>;
  turns: ShallowRef<Turn[]>;
  context: ShallowRef<ContextSize | null>;
  loadFailure: ShallowRef<unknown>;
  live: Live;
  streaming: ShallowRef<boolean>;
  children: Map<string, Child>;
  /** The chat's background helpers that wait on the person (ADR 0085, 1). */
  helpers: Map<string, WaitingHelper>;
  /** Loads the page of messages before the first one shown, above it. */
  showEarlier(): Promise<void>;
  /** Returns to the newest window, after earlier pages were loaded. */
  showLatest(): Promise<void>;
  refresh(ran?: readonly LiveCall[]): Promise<void>;
  stream(jobId: string, ran?: readonly LiveCall[]): Promise<void>;
};

type Scope = { workspaceId: string; sessionId: string };
const pollMs = 5_000;
const pageSize = 200;

// The page holds a window of messages (ADR 0059): at the latest, the oldest shown are dropped as new ones arrive;
// while the person reads earlier ones (`reading`), or after they loaded an earlier page, nothing is dropped.
export function useConversation(kvman: Kvman, sessionId: () => string | undefined, failed: (error: unknown) => void, reading: () => boolean = () => false): Conversation {
  const session = shallowRef<Session | null>(null);
  const messages = shallowRef<Message[]>([]);
  const omitted = shallowRef(0);
  const turns = shallowRef<Turn[]>([]);
  const context = shallowRef<ContextSize | null>(null);
  const loadFailure = shallowRef<unknown>(undefined);
  const streaming = shallowRef(false);
  const live = reactive<Live>(idleLive());
  const children = shallowReactive(new Map<string, Child>());
  const helpers = shallowReactive(new Map<string, WaitingHelper>());
  let scope: Scope | undefined;
  let latest: object | undefined;
  let listed: string | undefined;
  let closed = false;
  let extended = false;
  const current = (expected: Scope): boolean => !closed && scope === expected && sessionId() === expected.sessionId && kvman.workspace.value.id === expected.workspaceId;
  const streams = conversationStreams(kvman, live, streaming, () => refresh(), failed);
  const stored = (list: readonly Message[]): Message[] => list.filter(message => message.queued !== true);

  async function loadAll(id: string, key: string, owns: () => boolean): Promise<void> {
    if (!owns()) return;
    const list = await kvman.exec('kvcoder.message.list', { sessionId: id, limit: pageSize });
    if (!owns()) return;
    messages.value = list.messages; omitted.value = list.omitted; listed = key; extended = false;
  }

  async function loadNew(id: string, key: string, afterSeq: number, owns: () => boolean): Promise<void> {
    const list = await kvman.exec('kvcoder.message.list', { sessionId: id, limit: pageSize, afterSeq });
    if (!owns()) return;
    const fresh = stored(list.messages);
    if (fresh[0] !== undefined && fresh[0].seq !== afterSeq + 1) return loadAll(id, key, owns);
    const shown = stored(messages.value);
    const last = shown.at(-1)?.seq ?? afterSeq;
    const all = [...shown, ...fresh.filter(message => (message.seq ?? last) > last)];
    const dropped = extended || reading() ? 0 : Math.max(all.length - pageSize, 0);
    messages.value = [...all.slice(dropped), ...list.messages.filter(message => message.queued === true)];
    omitted.value += dropped;
  }

  async function showEarlier(): Promise<void> {
    const expected = scope;
    const first = stored(messages.value)[0]?.seq;
    if (expected === undefined || first === undefined) return;
    const list = await kvman.exec('kvcoder.message.list', { sessionId: expected.sessionId, limit: pageSize, beforeSeq: first });
    if (!current(expected) || stored(messages.value)[0]?.seq !== first) return;
    messages.value = [...list.messages, ...messages.value]; omitted.value = list.omitted; extended = true;
  }

  async function showLatest(): Promise<void> {
    const expected = scope;
    if (expected === undefined || !extended) return;
    await loadAll(expected.sessionId, `${expected.workspaceId}:${expected.sessionId}`, () => current(expected));
  }

  async function loadMessages(expected: Scope, owns: () => boolean): Promise<void> {
    const key = `${expected.workspaceId}:${expected.sessionId}`;
    const last = listed === key ? stored(messages.value).at(-1)?.seq : undefined;
    try {
      await (last === undefined ? loadAll(expected.sessionId, key, owns) : loadNew(expected.sessionId, key, last, owns));
      if (owns()) loadFailure.value = undefined;
    } catch (error) { if (owns()) loadFailure.value = error; }
  }

  async function loadChildren(expected: Scope, active: Turn | undefined, owns: () => boolean): Promise<void> {
    const ids = active?.sessionId === expected.sessionId && active.outcome === undefined && active.endedAt === undefined
      ? [...new Set(active.pending.flatMap(item => item.childSessionId === null ? [] : [item.childSessionId]))] : [];
    for (const id of children.keys()) if (!ids.includes(id)) children.delete(id);
    streams.retain(new Set([live, ...[...children.values()].map(child => child.live)]));
    for (const id of ids) {
      if (!owns()) return;
      const [found, [recent]] = await Promise.all([
        kvman.exec('kvcoder.session.get', { sessionId: id }),
        kvman.exec('kvcoder.turn.list', { sessionId: id, limit: 1 }),
      ]);
      if (!owns()) return;
      if (found.id !== id || found.parentId !== expected.sessionId) {
        children.delete(id);
        streams.retain(new Set([live, ...[...children.values()].map(child => child.live)]));
        continue;
      }
      const child = { session: found, turn: recent?.sessionId === id ? recent : undefined, live: children.get(id)?.live ?? reactive(idleLive()) };
      reconcileQuestionDrafts(expected.workspaceId, id, child.turn === undefined ? [] : [child.turn]);
      children.set(id, child);
      streams.update(child.live, found.status === 'running' ? found.stepJobId : undefined, () => current(expected));
    }
  }

  async function loadHelpers(expected: Scope, owns: () => boolean): Promise<void> {
    const found = await loadWaitingHelpers(kvman, expected.sessionId);
    if (!owns()) return;
    helpers.clear();
    for (const [id, helper] of found) {
      reconcileQuestionDrafts(expected.workspaceId, id, helper.child.turn === undefined ? [] : [helper.child.turn]);
      helpers.set(id, helper);
    }
  }

  async function reload(ran: readonly LiveCall[] = [], hinted?: string): Promise<void> {
    const expected = scope;
    if (expected === undefined || !current(expected)) return;
    const request = {}; latest = request;
    const owns = (): boolean => current(expected) && latest === request;
    try {
      const [found, recent, size] = await Promise.all([
        kvman.exec('kvcoder.session.get', { sessionId: expected.sessionId }),
        kvman.exec('kvcoder.turn.list', { sessionId: expected.sessionId, limit: 50 }),
        kvman.exec('kvcoder.context.get', { sessionId: expected.sessionId }),
      ]);
      if (!owns() || found.id !== expected.sessionId) return;
      if (session.value !== null && session.value.status !== found.status) kvman.refresh();
      if (!owns()) return;
      session.value = found; turns.value = recent; context.value = size;
      reconcileQuestionDrafts(expected.workspaceId, found.id, recent);
      const jobId = found.status === 'running' ? found.stepJobId : undefined;
      // A caller/hint cannot authorize a job. Carried approval labels belong only to its matching current job.
      streams.update(live, jobId, () => current(expected), hinted === undefined || hinted === jobId ? ran : []);
      // Revoke removed children immediately on authoritative state, even if message loading is slow.
      const active = found.status === 'waiting' ? recent[0] : undefined;
      const childLoad = loadChildren(expected, active, owns);
      await Promise.all([loadMessages(expected, owns), childLoad, loadHelpers(expected, owns)]);
    } catch (error) { if (owns()) throw error; }
  }

  async function refresh(ran: readonly LiveCall[] = []): Promise<void> { await reload(ran); }
  async function stream(jobId: string, ran: readonly LiveCall[] = []): Promise<void> { await reload(ran, jobId); }

  const timer = setInterval(() => {
    const expected = scope;
    if (expected !== undefined && !streams.busy()) refresh().catch(error => { if (current(expected)) failed(error); });
  }, pollMs);
  onUnmounted(() => { closed = true; scope = undefined; latest = undefined; streams.clear(); clearInterval(timer); });
  watch([sessionId, () => kvman.workspace.value.id], () => {
    const id = sessionId();
    scope = id === undefined ? undefined : { workspaceId: kvman.workspace.value.id, sessionId: id };
    latest = undefined; listed = undefined; streams.clear();
    session.value = null; messages.value = []; omitted.value = 0; turns.value = []; context.value = null; loadFailure.value = undefined;
    children.clear(); helpers.clear(); Object.assign(live, idleLive());
    const expected = scope;
    if (expected !== undefined) refresh().catch(error => { if (current(expected)) failed(error); });
  }, { immediate: true, flush: 'sync' });
  return { session, messages, omitted, turns, context, loadFailure, live, streaming, children, helpers, showEarlier, showLatest, refresh, stream };
}
