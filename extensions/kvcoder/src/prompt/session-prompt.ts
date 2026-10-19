import { z, type Ctx, type Stored } from '@kvman/sdk';
import { builtinDescriptions, builtinSignatures, commandsOf } from '../connectors/builtin-connectors.ts';
import type { ShellCommand } from '../calls/shell-command.ts';
import { shellFor } from '../calls/shell-program.ts';
import { builtinConnectors } from '../connector-call.ts';
import { delegateIndexDescription } from '../connectors/delegate.ts';
import { mcpIndexDescription } from '../connectors/mcp.ts';
import { preferencesSection } from './person-preferences.ts';
import { projectRules } from './project-rules.ts';
import type { ConnectorRow } from '../registry/register-connectors.ts';
import { helperAllows } from '../turns/helper-calls.ts';
import { readOnlyAllows } from '../turns/read-only.ts';
import { sectionsFor } from '../registry/register-sections.ts';
import { invalid } from '../problems.ts';
import { agentProfile } from '../register-settings.ts';
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
  // The settings and files the prompt needs are read together: each read waits on the kernel, so one after another
  // they add up (the person's preferences among them, ADR 0092, 3).
  const [rules, preferences, shell, profile, language, grants] = await Promise.all([
    projectRules(ctx.job.workspace.path),
    preferencesSection(ctx),
    shellFor(ctx),
    agentProfile(ctx),
    ctx.settings.get('kernel.language'),
    sessionGrants(ctx, session.id),
  ]);
  if (grants === undefined) throw invalid('The session ancestry is no longer available.');
  const { connectors, disabled, names, workers, servers } = grants;
  const descriptions = { ...builtinDescriptions(shell.kind), delegate: delegateIndexDescription(workers), mcp: mcpIndexDescription(servers) };
  const current = grants.session;
  // A helper is shown only what it may run (ADR 0063, 1), and a read-only worker's helper less (ADR 0056, 4).
  const readOnly = current.worker?.readOnly === true;
  const helper = current.parentId !== null;
  const builtins = builtinConnectors.filter(name => names.includes(name)).map(name => {
    const shown = Object.entries(commandsOf(name)).map(([command, entry], index) => ({ command, signature: builtinSignatures[name][index] ?? '', allowed: (!helper || helperAllows(entry)) && (!readOnly || readOnlyAllows(command, entry)) })).filter(row => row.allowed);
    return { name, description: descriptions[name], commands: shown.map(row => row.command), signatures: shown.map(row => row.signature) };
  });
  // A read-only helper sees a registered connector only with its commands that run a query (ADR 0082, 3).
  const registered = connectors.filter(connector => names.includes(connector.name)).map(connector => ({
    name: connector.name,
    description: connector.description,
    commands: connector.commands?.filter(command => !readOnly || readOnlyAllows(command.name, undefined, command)).map(command => command.name) ?? (readOnly ? [] : ['exec']),
  }));
  const listed = [...builtins.filter(connector => connector.commands.length > 0), ...registered.filter(connector => connector.commands.length > 0)];
  const built = buildPrompt({
    role: current.parentId === null ? 'lead' : 'worker',
    profile,
    workspacePath: ctx.job.workspace.path,
    platform: process.platform,
    shell: shell.kind,
    language: z.string().parse(language),
    sections: [...preferences, ...(await sectionsFor(ctx, current.id)), ...rules],
    ...(current.worker === null ? {} : { worker: current.worker }),
    decides: current.decides,
    connectors: listed,
  });
  for (const section of built.left) ctx.log.warn('A section was left out of a prompt past 64 KB of sections.', { owner: section.owner, id: section.id });
  return { built, shell, connectors, listed, disabled };
}
