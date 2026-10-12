import type { Ctx, Stored } from '@kvman/sdk';
import { builtinConnectors } from '../connector-call.ts';
import { isProgram, listedWorkers, workerCheckName } from '../delegate/workers.ts';
import { mcpServers } from '../mcp/servers.ts';
import { connectorsInTx, prepareConnectors, type ConnectorRow } from '../registry/register-connectors.ts';
import { disabledConnectors } from '../register-settings.ts';
import type { SessionDoc } from '../schemas/records.ts';
import { executionRootInTx } from '../sessions/execution-root.ts';
import { txRecords, type TxRecords } from '../store/collections.ts';

/** The existing connector scope predicate, shared by prompt and execution (ADR0044). */
function allowedNames(session: SessionDoc, connectors: readonly ConnectorRow[], disabled: ReadonlySet<string>): Set<string> {
  const names = [...builtinConnectors, ...connectors.map(connector => connector.name)].filter(name => !disabled.has(name));
  if (session.parentId === null) return new Set(names);
  return new Set(names.filter(name => name === 'ask' || (name !== 'delegate' && (session.connectors === null || session.connectors.includes(name)))));
}

/** Await external data before the caller's final canonical store validation, not afterwards. */
export async function prepareGrants(ctx: Ctx) {
  const connectors = await prepareConnectors(ctx);
  const servers = await mcpServers(ctx);
  const workers = await listedWorkers(ctx);
  const disabled = await disabledConnectors(ctx);
  return { connectors, servers, workers, disabled };
}
export type GrantPreparation = Awaited<ReturnType<typeof prepareGrants>>;

/** Canonical session/root/registry grant decision in the SAME tx as the caller's authority proof. */
export function grantsInTx(store: TxRecords, session: Stored<SessionDoc>, prepared: GrantPreparation) {
  const root = executionRootInTx(store, session.id);
  if (root === undefined) return undefined;
  const connectors = connectorsInTx(store, prepared.connectors);
  const disabled = new Set([...prepared.disabled, ...connectors.filter(connector => connector.optIn && !root.optedIn.includes(connector.name)).map(connector => connector.name)]);
  const allowed = allowedNames(session, connectors, disabled);
  const passed = new Set((session.checks ?? []).filter(check => check.passed).map(check => check.name));
  const workers = prepared.workers.filter(worker => worker.enabled && (!isProgram(worker) || passed.has(workerCheckName(worker.name))));
  const servers = prepared.servers;
  const present: Partial<Record<string, boolean>> = { mcp: servers.length > 0, delegate: workers.length > 0 };
  const names = [
    ...builtinConnectors.filter(name => allowed.has(name) && present[name] !== false),
    ...connectors.filter(connector => allowed.has(connector.name) && (connector.kind === 'commands' || passed.has(connector.name))).map(connector => connector.name),
  ];
  return { session, connectors, disabled, names, workers, servers };
}
export type SessionGrants = NonNullable<ReturnType<typeof grantsInTx>>;

export async function sessionGrants(ctx: Ctx, sessionId: string): Promise<SessionGrants | undefined> {
  const prepared = await prepareGrants(ctx);
  return ctx.store.transaction(tx => {
    const store = txRecords(tx), session = store.sessions.get(sessionId);
    return session === undefined ? undefined : grantsInTx(store, session, prepared);
  });
}
