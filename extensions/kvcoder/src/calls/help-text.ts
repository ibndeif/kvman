import type { Json } from '@kvman/sdk';

// The text of a connector's `help` (plan 08 §8.3, ADR 0011, 4): the connector with its commands, or one command with
// its payload, result, and examples written as `run` arguments.

export type HelpCommand = { name: string; description: string };

export type HelpDetail = HelpCommand & { notes?: string | undefined; payload: Json; result: Json | string; examples: readonly { description: string; input: Json }[] };

const helpCommand: HelpCommand = { name: 'help', description: 'Describes this connector, or one command with { "command": "<name>" }.' };

/** A connector's own help: what it is for, and each command with its description. */
export function connectorHelp(name: string, description: string, commands: readonly HelpCommand[]): string {
  const listed = [...commands, helpCommand];
  const width = Math.max(...listed.map((command) => command.name.length));
  return [
    `${name}: ${description}`,
    '',
    'Commands:',
    ...listed.map((command) => `  ${command.name.padEnd(width)}  ${command.description}`),
    '',
    'Call help with { "command": "<name>" } for a command\'s payload, result, and examples.',
  ].join('\n');
}

/** One command's help: its payload and result, and its examples as `run` arguments. */
export function commandHelp(connector: string, command: HelpDetail): string {
  const result = typeof command.result === 'string' ? [`Result: ${command.result}`] : ['Result (JSON Schema):', JSON.stringify(command.result, null, 2)];
  const examples = command.examples.flatMap((example) => [`  # ${example.description}`, `  { "connector": ${JSON.stringify(connector)}, "command": ${JSON.stringify(command.name)}, "payload": ${JSON.stringify(example.input)} }`]);
  const notes = command.notes === undefined ? [] : ['', command.notes];
  return [`${connector} ${command.name}: ${command.description}`, ...notes, '', 'Payload (JSON Schema):', JSON.stringify(command.payload, null, 2), '', ...result, ...(examples.length > 0 ? ['', 'Examples:', ...examples] : [])].join('\n');
}
