import { z, type Ctx, type Stored } from '@kvman/sdk';
import { builtinDescriptions, builtinSignatures, commandsOf } from '../connectors/builtin-connectors.ts';
import type { ShellCommand } from '../calls/shell-command.ts';
import { shellFor } from '../calls/shell-program.ts';
import { builtinConnectors } from '../connector-call.ts';
import { delegateIndexDescription } from '../connectors/delegate.ts';
import { mcpIndexDescription } from '../connectors/mcp.ts';
import { availableWorkers } from '../delegate/workers.ts';
import { mcpServers } from '../mcp/servers.ts';
import { activeConnectors, type ConnectorRow } from '../registry/register-connectors.ts';
import { disabledConnectors } from '../register-settings.ts';
import { sectionsFor } from '../registry/register-sections.ts';
import type { SessionDoc } from '../schemas/records.ts';
import { buildPrompt, type BuiltPrompt } from './build-prompt.ts';

// A session's prompt and the connectors its agent may use: a subagent gets its worker's among its parent's, never
// `delegate`, always `ask` (plan 08 §8.5); binary connectors count once their check passed (plan 08 §8.4), `mcp` while
// the workspace has a server, and `delegate` while a worker is available, each entry naming them (ADR 0020, 10 and 12;
// ADR 0021, 1 and 18).

/** A connector the session's agent can call: its entry in the prompt's index and in the `run` tool's enum. */
export type ListedConnector = { name: string; description: string; commands: string[]; signatures?: readonly string[] };

export type SessionTools = {
  built: BuiltPrompt;
  shell: ShellCommand;
  /** Every registered connector of the run, callable or not. */
  connectors: ConnectorRow[];
  /** The connectors the session may call, in the prompt's order. */
  listed: ListedConnector[];
  /** The names that are turned off (ADR 0014, 7). */
  disabled: ReadonlySet<string>;
};

// The connector names a session may use: none that is turned off (ADR 0014, 7), and for a subagent only its worker's (ADR 0021, 24).
function allowedNames(session: SessionDoc, connectors: readonly ConnectorRow[], disabled: ReadonlySet<string>): Set<string> {
  const names = [...builtinConnectors, ...connectors.map((connector) => connector.name)].filter((name) => !disabled.has(name));
  if (session.parentId === null) return new Set(names);
  return new Set(names.filter((name) => name === 'ask' || (name !== 'delegate' && (session.connectors === null || session.connectors.includes(name)))));
}

export async function sessionTools(ctx: Ctx, session: Stored<SessionDoc>): Promise<SessionTools> {
  const shell = await shellFor(ctx);
  const connectors = await activeConnectors(ctx);
  const disabled = await disabledConnectors(ctx);
  const allowed = allowedNames(session, connectors, disabled);
  const passed = new Set((session.checks ?? []).filter((check) => check.passed).map((check) => check.name));
  const servers = await mcpServers(ctx);
  const workers = await availableWorkers(ctx, session.checks);
  const descriptions = { ...builtinDescriptions(shell.kind), delegate: delegateIndexDescription(workers), mcp: mcpIndexDescription(servers) };
  const present: Partial<Record<string, boolean>> = { mcp: servers.length > 0, delegate: workers.length > 0 };
  const listed = [
    ...builtinConnectors.filter((name) => allowed.has(name) && present[name] !== false).map((name) => ({ name, description: descriptions[name], commands: Object.keys(commandsOf(name)), signatures: builtinSignatures[name] })),
    ...connectors
      .filter((connector) => allowed.has(connector.name) && (connector.kind === 'commands' || passed.has(connector.name)))
      .map((connector) => ({ name: connector.name, description: connector.description, commands: connector.commands?.map((command) => command.name) ?? ['exec'] })),
  ];
  const built = buildPrompt({
    workspacePath: ctx.job.workspace.path,
    platform: process.platform,
    shell: shell.kind,
    language: z.string().parse(await ctx.settings.get('kernel.language')),
    sections: await sectionsFor(ctx, session.id),
    ...(session.worker === null ? {} : { worker: session.worker }),
    connectors: listed,
  });
  for (const section of built.left) ctx.log.warn('A section was left out of a prompt past 64 KB of sections.', { owner: section.owner, id: section.id });
  return { built, shell, connectors, listed, disabled };
}
