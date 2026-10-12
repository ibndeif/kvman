import { isDeepStrictEqual } from 'node:util';
import { ProblemError, type Ctx } from '@kvman/sdk';
import type { RunCall } from '../calls/run-tool.ts';
import { builtinConnectors, noCommandMessage, noConnectorMessage } from '../connector-call.ts';
import { grantsInTx, prepareGrants, type SessionGrants } from '../prompt/session-grants.ts';
import type { HeldResult } from '../schemas/records.ts';
import { txRecords } from '../store/collections.ts';
import { commandNamesOf, targetOf, type CommandTarget } from './run-command.ts';
import type { StepLease } from './step-claim.ts';
import { liveStep } from './step-intents.ts';

type Refusal = { code: 'VALIDATION_FAILED' | 'NOT_FOUND'; message: string };
type Permission = { grants: SessionGrants; target: CommandTarget | undefined } | { error: Refusal };
const stale = (): Permission => ({ error: { code: 'VALIDATION_FAILED', message: 'The originating step or approved call is no longer current.' } });

function unavailable(grants: SessionGrants, connector: string): string {
  const known = builtinConnectors.some(name => name === connector) || grants.connectors.some(candidate => candidate.name === connector);
  if (known && !grants.disabled.has(connector) && grants.session.parentId !== null) return `${connector} isn't available in this subagent.`;
  return noConnectorMessage(connector, grants.names);
}

/** No external preparation remains after this transaction's authority/scope/registry decision. */
export async function callPermission(ctx: Ctx, lease: StepLease, call: RunCall, held?: HeldResult): Promise<Permission> {
  ctx.job.signal.throwIfAborted();
  if (ctx.job.id !== lease.jobId) return stale();
  const prepared = await prepareGrants(ctx);
  return ctx.store.transaction(tx => {
    ctx.job.signal.throwIfAborted();
    const store = txRecords(tx), live = liveStep(store, lease, ctx.job.id);
    if (live === undefined) return stale();
    if (held !== undefined && (live.turn.pending.length !== 0 || live.turn.calls.filter(row => row.toolCallId === held.toolCallId && row.toolName === 'run').length !== 1 || live.turn.results.filter(row => row.toolCallId === held.toolCallId).length !== 1 || !live.turn.results.some(row => isDeepStrictEqual(row, held)))) return stale();
    const grants = grantsInTx(store, live.session, prepared);
    if (grants === undefined) return { error: { code: 'VALIDATION_FAILED', message: 'The session ancestry is no longer available.' } };
    if (!grants.names.includes(call.connector)) return { error: { code: 'VALIDATION_FAILED', message: unavailable(grants, call.connector) } };
    const target = call.command === 'help' ? undefined : targetOf(grants.connectors, call);
    if (target === undefined && call.command !== 'help') return { error: { code: 'NOT_FOUND', message: noCommandMessage(call.connector, call.command, commandNamesOf(grants.connectors, call.connector)) } };
    return { grants, target };
  });
}

/** A queued/resumed dispatch cannot reuse a revoked grant, obsolete lease or changed immediate target. */
export function dispatchGuard(ctx: Ctx, lease: StepLease, call: RunCall, expected?: CommandTarget, held?: HeldResult): () => Promise<void> {
  return async () => {
    const checked = await callPermission(ctx, lease, call, held);
    if ('error' in checked) throw new ProblemError({ ...checked.error, params: {} });
    if (checked.target?.registration !== expected?.registration || checked.target?.asks !== expected?.asks) throw new ProblemError({ code: 'VALIDATION_FAILED', message: 'The connector command changed before execution. Make this call again.', params: {} });
  };
}
