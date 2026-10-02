import { z, type Ctx, type Stored } from '@kvman/sdk';
import { builtinConnectors } from '../connector-line.ts';
import { activeConnectors, type ConnectorRow } from '../registry/register-connectors.ts';
import { sectionsFor } from '../registry/register-sections.ts';
import { settingSchemas } from '../register-settings.ts';
import type { SessionDoc } from '../schemas/records.ts';
import { onPath, shellCommand, type ShellCommand } from '../calls/shell-command.ts';
import { buildPrompt, type BuiltPrompt } from './build-prompt.ts';

// A session's prompt and the connectors its agent may use: a subagent gets its parent's subset, never `subagent`,
// always `ask` (plan 08 §8.5); binary connectors count once their check passed (plan 08 §8.4).

const builtinDescriptions: Record<(typeof builtinConnectors)[number], string> = {
  ask: 'Put a question to the person and wait for the answer. Use it when you need a decision, a missing detail, or a go-ahead before a risky step, instead of guessing (commands: text, choice, confirm).',
  subagent: 'Hand a self-contained task to a helper agent. Use it to research or build a separate part in parallel, or in the background while you go on (command: run).',
  jobs: 'Check on background work you started, a server from mode "async" or a --async call. Use it to see its status or output, or to stop it (commands: list, get, cancel).',
  fs: 'Create and change files in the workspace folder. Use it for every file you create or change: write for a new file or a full rewrite, and edit for exact text replacements in an existing file (commands: write, edit).',
};

export type SessionTools = {
  built: BuiltPrompt;
  shell: ShellCommand;
  connectors: ConnectorRow[];
  allowed: ReadonlySet<string>;
};

// The connector names a session may use.
function allowedNames(session: SessionDoc, connectors: readonly ConnectorRow[]): Set<string> {
  const names = [...builtinConnectors, ...connectors.map((connector) => connector.name)];
  if (session.parentId === null) return new Set(names);
  return new Set(names.filter((name) => name === 'ask' || (name !== 'subagent' && (session.connectors === null || session.connectors.includes(name)))));
}

export async function shellFor(ctx: Ctx): Promise<ShellCommand> {
  const configured = settingSchemas.shellPath.parse(await ctx.settings.get('kvcoder.shell.path'));
  return shellCommand(process.platform, configured, () => onPath('pwsh', process.env, process.platform));
}

export async function sessionTools(ctx: Ctx, session: Stored<SessionDoc>): Promise<SessionTools> {
  const shell = await shellFor(ctx);
  const connectors = await activeConnectors(ctx);
  const allowed = allowedNames(session, connectors);
  const passed = new Set((session.checks ?? []).filter((check) => check.passed).map((check) => check.name));
  const listed = [
    ...connectors.filter((connector) => allowed.has(connector.name) && (connector.kind === 'commands' || passed.has(connector.name))).map((connector) => ({ name: connector.name, description: connector.description, kind: connector.kind })),
    ...builtinConnectors.filter((name) => allowed.has(name)).map((name) => ({ name, description: builtinDescriptions[name], kind: 'builtin' as const })),
  ];
  const built = buildPrompt({
    workspacePath: ctx.job.workspace.path,
    platform: process.platform,
    toolName: shell.toolName,
    language: z.string().parse(await ctx.settings.get('kernel.language')),
    sections: await sectionsFor(ctx, session.id),
    connectors: listed,
  });
  for (const section of built.left) ctx.log.warn('A section was left out of a prompt past 64 KB of sections.', { owner: section.owner, id: section.id });
  return { built, shell, connectors, allowed };
}
