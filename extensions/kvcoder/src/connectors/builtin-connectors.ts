import type { BuiltinConnector } from '../connector-call.ts';
import { artifactCommands, artifactDescription } from './artifact.ts';
import { askCommands, askDescription } from './ask.ts';
import { backgroundCommands, backgroundDescription } from './background.ts';
import type { ConnectorCommand } from './connector-command.ts';
import { fsCommands, fsDescription } from './fs.ts';
import { shellCommands, shellDescription } from './shell.ts';
import { subagentCommands, subagentDescription } from './subagent.ts';

// kvcoder's own connectors together (plan 08 §8.3 and §8.5): each lives in its own file, with its description, its
// payloads, its commands, and the jobs behind them.

export const builtinCommands = {
  shell: shellCommands,
  fs: fsCommands,
  artifact: artifactCommands,
  background: backgroundCommands,
  ask: askCommands,
  subagent: subagentCommands,
} satisfies Record<BuiltinConnector, Record<string, ConnectorCommand>>;

/** A built-in connector's commands by name, in the order `help` lists them. */
export function commandsOf(connector: BuiltinConnector): Readonly<Record<string, ConnectorCommand>> {
  return builtinCommands[connector];
}

/** What the prompt's connector index and `help` say each built-in connector is for; `shell` names the shell this run uses. */
export function builtinDescriptions(shell: 'bash' | 'powershell'): Record<BuiltinConnector, string> {
  return { shell: shellDescription(shell), fs: fsDescription, artifact: artifactDescription, background: backgroundDescription, ask: askDescription, subagent: subagentDescription };
}
