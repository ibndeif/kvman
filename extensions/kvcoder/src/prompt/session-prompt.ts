import { z, type Ctx, type Stored } from '@kvman/sdk';
import { builtinDescriptions, builtinSignatures, commandsOf } from '../connectors/builtin-connectors.ts';
import type { ShellCommand } from '../calls/shell-command.ts';
import { shellFor } from '../calls/shell-program.ts';
import { builtinConnectors } from '../connector-call.ts';
import { activeConnectors, type ConnectorRow } from '../registry/register-connectors.ts';
import { sectionsFor } from '../registry/register-sections.ts';
import type { SessionDoc } from '../schemas/records.ts';
import { buildPrompt, type BuiltPrompt } from './build-prompt.ts';

// A session's prompt and the connectors its agent may use: a subagent gets its parent's subset, never `subagent`,
// always `ask` (plan 08 §8.5); binary connectors count once their check passed (plan 08 §8.4).

/** A connector the session's agent can call: its entry in the prompt's index and in the `run` tool's enum. */
export type ListedConnector = { name: string; description: string; commands: string[]; signatures?: readonly string[] };

export type SessionTools = {
  built: BuiltPrompt;
  shell: ShellCommand;
  /** Every registered connector of the run, callable or not. */
  connectors: ConnectorRow[];
  /** The connectors the session may call, in the prompt's order. */
  listed: ListedConnector[];
};

// The connector names a session may use.
function allowedNames(session: SessionDoc, connectors: readonly ConnectorRow[]): Set<string> {
  const names = [...builtinConnectors, ...connectors.map((connector) => connector.name)];
  if (session.parentId === null) return new Set(names);
  return new Set(names.filter((name) => name === 'ask' || (name !== 'subagent' && (session.connectors === null || session.connectors.includes(name)))));
}

export async function sessionTools(ctx: Ctx, session: Stored<SessionDoc>): Promise<SessionTools> {
  const shell = await shellFor(ctx);
  const connectors = await activeConnectors(ctx);
  const allowed = allowedNames(session, connectors);
  const passed = new Set((session.checks ?? []).filter((check) => check.passed).map((check) => check.name));
  const descriptions = builtinDescriptions(shell.kind);
  const listed = [
    ...builtinConnectors.filter((name) => allowed.has(name)).map((name) => ({ name, description: descriptions[name], commands: Object.keys(commandsOf(name)), signatures: builtinSignatures[name] })),
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
    connectors: listed,
  });
  for (const section of built.left) ctx.log.warn('A section was left out of a prompt past 64 KB of sections.', { owner: section.owner, id: section.id });
  return { built, shell, connectors, listed };
}
