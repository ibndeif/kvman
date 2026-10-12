import type { Kvman } from '@kvman/sdk/web';
import type { ShallowRef } from 'vue';
import { applyEvent, idleLive, type Live, type LiveCall } from './live-step.ts';

type Owner = { jobId: string; target: Live; current: () => boolean };

/** Logical ownership is private: SDK stream has no signal option. Existing transports close on unmount. */
export function conversationStreams(kvman: Kvman, live: Live, streaming: ShallowRef<boolean>, reconcile: () => Promise<void>, failed: (error: unknown) => void) {
  const owners = new Map<Live, Owner>();
  let ended = new WeakMap<Live, string>();
  const owns = (owner: Owner): boolean => owner.current() && owners.get(owner.target) === owner;
  const report = (owner: Owner, error: unknown): void => { if (owns(owner)) failed(error); };
  async function reread(owner: Owner): Promise<void> {
    if (!owner.current()) return;
    try { await reconcile(); } catch (error) { if (owner.current()) failed(error); }
  }

  async function run(owner: Owner): Promise<void> {
    let completed = false;
    let offline = false;
    try {
      kvman.follow(owner.jobId).catch(error => report(owner, error));
      for await (const event of kvman.stream(owner.jobId)) {
        if (!owner.current()) break;
        // Retired waiting steps may still announce a successor before their terminal event. Their
        // hints can request a reread, but their data never mutates live state; a replacement owns its slot.
        if (!owns(owner) && owners.has(owner.target)) break;
        // The SDK yields OFFLINE then exhausts normally; that is transport loss, not job completion.
        if (event.type === 'problem' && event.problem.code === 'kvwebui/OFFLINE') offline = true;
        const signal = applyEvent(owns(owner) ? owner.target : idleLive(), event);
        if (signal.kind !== 'none') await reread(owner);
        if (!owner.current() || (!owns(owner) && owners.has(owner.target))) break;
      }
      completed = !offline;
    } catch (error) {
      report(owner, error);
    } finally {
      if (owns(owner)) {
        owners.delete(owner.target);
        if (completed) ended.set(owner.target, owner.jobId);
        Object.assign(owner.target, idleLive());
        if (owner.target === live) streaming.value = false;
      }
      // Reconciliation selects a saved successor, never a hinted job. A terminal stream is not reattached
      // repeatedly while its old pointer is still visible; a different/cleared authoritative job releases it.
      if (completed) await reread(owner);
    }
  }

  function update(target: Live, jobId: string | undefined, current: () => boolean, ran: readonly LiveCall[] = []): void {
    const previous = owners.get(target);
    if (previous !== undefined && previous.jobId === jobId && owns(previous)) return;
    if (previous !== undefined) owners.delete(target);
    if (ended.get(target) === jobId && jobId !== undefined) return;
    ended.delete(target);
    Object.assign(target, idleLive());
    if (target === live) streaming.value = false;
    if (jobId === undefined || !current()) return;
    const owner: Owner = { jobId, target, current };
    owners.set(target, owner);
    target.calls = ran.map(call => ({ ...call, complete: true, carried: true }));
    if (target === live) streaming.value = true;
    void run(owner);
  }

  function retain(targets: ReadonlySet<Live>): void {
    for (const target of owners.keys()) if (!targets.has(target)) owners.delete(target);
  }
  function clear(): void {
    owners.clear(); ended = new WeakMap(); streaming.value = false;
  }
  return { update, retain, clear, busy: () => owners.size > 0 };
}
