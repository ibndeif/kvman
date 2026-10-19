import type { RunCall } from '../calls/run-tool.ts';
import { executionRootInTx } from '../sessions/execution-root.ts';
import type { TxRecords } from '../store/collections.ts';

// The hosts a chat let `web fetch` reach (plan 08 §8.5, ADR 0095, 4): the first fetch from a host asks, and an allowed
// one is kept on the chat at the root, so its helpers share it.

/** The host a `web fetch` call names, lowercase, or nothing for another call or an address that doesn't parse. */
export function hostOf(call: RunCall): string | undefined {
  if (call.connector !== 'web' || call.command !== 'fetch') return undefined;
  const given = call.payload['url'];
  return typeof given === 'string' && URL.canParse(given) ? new URL(given).hostname.toLowerCase() : undefined;
}

/** Adds the host of an allowed `web fetch` to the chat at the root, in the transaction that applies the answer. */
export function allowHostInTx(store: TxRecords, sessionId: string, call: RunCall): void {
  const host = hostOf(call);
  const root = executionRootInTx(store, sessionId);
  if (host === undefined || root === undefined || root.webHosts.includes(host)) return;
  store.sessions.update(root.id, { webHosts: [...root.webHosts, host] });
}
