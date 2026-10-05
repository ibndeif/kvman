import { payloadSignature, type BuiltinConnector } from '../connector-call.ts';
import { artifactCommands, artifactDescription } from './artifact.ts';
import { askCommands, askDescription } from './ask.ts';
import { backgroundCommands, backgroundDescription } from './background.ts';
import { payloadJsonSchema, type ConnectorCommand } from './connector-command.ts';
import { delegateCommands, delegateDescription } from './delegate.ts';
import { fsCommands, fsDescription } from './fs.ts';
import { mcpCommands, mcpDescription } from './mcp.ts';
import { shellCommands, shellDescription } from './shell.ts';

// kvcoder's own connectors together (plan 08 §8.3 and §8.5): each lives in its own file, with its description, its
// payloads, its commands, and the jobs behind them.

export const builtinCommands = {
  shell: shellCommands,
  fs: fsCommands,
  artifact: artifactCommands,
  background: backgroundCommands,
  ask: askCommands,
  delegate: delegateCommands,
  mcp: mcpCommands,
} satisfies Record<BuiltinConnector, Record<string, ConnectorCommand>>;

/** A built-in connector's commands by name, in the order `help` lists them. */
export function commandsOf(connector: BuiltinConnector): Readonly<Record<string, ConnectorCommand>> {
  return builtinCommands[connector];
}

/** What the prompt's connector index and `help` say each built-in connector is for; `shell` names the shell this run uses. */
export function builtinDescriptions(shell: 'bash' | 'powershell'): Record<BuiltinConnector, string> {
  return { shell: shellDescription(shell), fs: fsDescription, artifact: artifactDescription, background: backgroundDescription, ask: askDescription, delegate: delegateDescription, mcp: mcpDescription };
}

// Each built-in payload is an object, so a missing signature is a programming error, not a case the prompt may fall
// back from; computed once per worker, not at every prompt build. In the order of `commandsOf`, like the prompt's lines.
function signaturesOf(connector: BuiltinConnector): readonly string[] {
  return Object.values(commandsOf(connector)).map((command) => {
    const signature = payloadSignature(payloadJsonSchema(command.payload));
    if (signature === undefined) throw new Error(`The payload of a ${connector} command has no signature.`);
    return signature;
  });
}

/** Each built-in connector's command payloads' signatures, one per command, in `commandsOf`'s order. */
export const builtinSignatures: Record<BuiltinConnector, readonly string[]> = {
  shell: signaturesOf('shell'),
  fs: signaturesOf('fs'),
  artifact: signaturesOf('artifact'),
  background: signaturesOf('background'),
  ask: signaturesOf('ask'),
  delegate: signaturesOf('delegate'),
  mcp: signaturesOf('mcp'),
};
