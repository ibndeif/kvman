import { z, type Ctx, type Stored } from '@kvman/sdk';
import { builtinDescriptions, builtinSignatures, commandsOf } from '../connectors/builtin-connectors.ts';
import type { ShellCommand } from '../calls/shell-command.ts';
import { shellFor } from '../calls/shell-program.ts';
import { builtinConnectors } from '../connector-call.ts';
import { delegateIndexDescription } from '../connectors/delegate.ts';
import { mcpIndexDescription } from '../connectors/mcp.ts';
import { projectRules } from './project-rules.ts';
import type { ConnectorRow } from '../registry/register-connectors.ts';
import { readOnlyAllows } from '../turns/read-only.ts';
import { sectionsFor } from '../registry/register-sections.ts';
import { invalid } from '../problems.ts';
import type { SessionDoc } from '../schemas/records.ts';
import { buildPrompt, type BuiltPrompt } from './build-prompt.ts';
import { sessionGrants } from './session-grants.ts';

/** A connector the session's agent can call: its entry in the prompt's index and in the `run` tool's enum. */
export type ListedConnector = { name: string; description: string; commands: string[]; signatures?: readonly string[] };

export type SessionTools = {
  built: BuiltPrompt;
  shell: ShellCommand;
  /** Every registered connector of the run, callable or not. */
  connectors: ConnectorRow[];
  /** The connectors the session may call, in the prompt's order. */
  listed: ListedConnector[];
  /** Disabled names, including optIn connectors this chat never enabled. */
  disabled: ReadonlySet<string>;
};

/** Prompt-time listing shares the execution predicate but never serves as later execution authority (ADR0044). */
export async function sessionTools(ctx: Ctx, session: Stored<SessionDoc>): Promise<SessionTools> {
  const rules = projectRules(ctx.job.workspace.path);
  const shell = await shellFor(ctx);
  const grants = await sessionGrants(ctx, session.id);
  if (grants === undefined) throw invalid('The session ancestry is no longer available.');
  const { connectors, disabled, names, workers, servers } = grants;
  const descriptions = { ...builtinDescriptions(shell.kind), delegate: delegateIndexDescription(workers), mcp: mcpIndexDescription(servers) };
  const current = grants.session;
  // A read-only worker's helper is shown only what it may run (ADR 0056, 4).
  const readOnly = current.worker?.readOnly === true;
  const builtins = builtinConnectors.filter(name => names.includes(name)).map(name => {
    const shown = Object.entries(commandsOf(name)).map(([command, entry], index) => ({ command, signature: builtinSignatures[name][index] ?? '', allowed: !readOnly || readOnlyAllows(command, entry) })).filter(row => row.allowed);
    return { name, description: descriptions[name], commands: shown.map(row => row.command), signatures: shown.map(row => row.signature) };
  });
  const listed = [
    ...builtins.filter(connector => connector.commands.length > 0),
    ...(readOnly ? [] : connectors.filter(connector => names.includes(connector.name)).map(connector => ({ name: connector.name, description: connector.description, commands: connector.commands?.map(command => command.name) ?? ['exec'] }))),
  ];
  const built = buildPrompt({
    role: current.parentId === null ? 'lead' : 'worker',
    workspacePath: ctx.job.workspace.path,
    platform: process.platform,
    shell: shell.kind,
    language: z.string().parse(await ctx.settings.get('kernel.language')),
    sections: [...(await sectionsFor(ctx, current.id)), ...(await rules)],
    ...(current.worker === null ? {} : { worker: current.worker }),
    connectors: listed,
  });
  for (const section of built.left) ctx.log.warn('A section was left out of a prompt past 64 KB of sections.', { owner: section.owner, id: section.id });
  return { built, shell, connectors, listed, disabled };
}
