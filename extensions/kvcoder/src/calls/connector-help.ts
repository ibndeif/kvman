import { z, type Ctx } from '@kvman/sdk';
import { builtinConnectors, noCommandMessage, type BuiltinConnector } from '../connector-call.ts';
import { notFound } from '../problems.ts';
import { callInfos } from '../registry/loaded.ts';
import { activeConnectors, type ConnectorRow } from '../registry/register-connectors.ts';
import { truncate } from '../result-text.ts';
import { binaryExec } from '../connectors/binary.ts';
import { builtinDescriptions, commandsOf } from '../connectors/builtin-connectors.ts';
import { payloadJsonSchema, type ConnectorCommand } from '../connectors/connector-command.ts';
import { commandHelp, connectorHelp, type HelpDetail } from './help-text.ts';
import { runShell } from './run-shell.ts';
import { shellFor } from './shell-program.ts';

// `help` of any connector (plan 08 §8.3 and §8.4, ADR 0011, 4 and 5): the connector's commands, or one command's
// payload, result, and examples. A binary connector's help also prints the program's own.

const asksNote = 'The person is asked before this runs.';

const programHelpTimeoutMs = 5_000;

const builtinDetail = (name: string, command: ConnectorCommand): HelpDetail => ({ name, description: command.description, notes: command.notes, payload: payloadJsonSchema(command.payload), result: command.result ?? {}, examples: [] });

// A built-in command's result is what its table entry says, or the output schema its registration has.
async function builtinHelp(ctx: Ctx, connector: BuiltinConnector, command: string | undefined): Promise<string> {
  const commands = commandsOf(connector);
  if (command === undefined) return connectorHelp(connector, builtinDescriptions((await shellFor(ctx)).kind)[connector], Object.entries(commands).map(([name, entry]) => ({ name, description: entry.description })));
  const found = commands[command];
  if (found === undefined) throw notFound(noCommandMessage(connector, command, Object.keys(commands)), { connector, command });
  const result = found.result ?? (await callInfos(ctx)).find((info) => info.name === found.registration)?.output ?? {};
  return commandHelp(connector, { ...builtinDetail(command, found), result });
}

async function commandsHelp(ctx: Ctx, connector: ConnectorRow, command: string | undefined): Promise<string> {
  const infos = await callInfos(ctx);
  const commands = connector.commands ?? [];
  const info = (name: string) => infos.find((candidate) => candidate.name === name);
  if (command === undefined) return connectorHelp(connector.name, connector.description, commands.map((entry) => ({ name: entry.name, description: info(entry.command)?.description ?? '' })));
  const found = commands.find((entry) => entry.name === command);
  if (found === undefined) throw notFound(noCommandMessage(connector.name, command, commands.map((entry) => entry.name)), { connector: connector.name, command });
  const registered = info(found.command);
  return commandHelp(connector.name, { name: found.name, description: registered?.description ?? '', notes: found.asks ? asksNote : undefined, payload: registered?.input ?? {}, result: registered?.output ?? {}, examples: found.examples });
}

// The line that prints a program's help: `<name> [command] --help`, or the registered line with `{command}` filled in.
function programHelpLine(connector: ConnectorRow, command: string | undefined): string {
  const template = connector.binary?.help ?? `${connector.name} {command} --help`;
  return template.replaceAll('{command}', command ?? '').replace(/ {2,}/g, ' ').trim();
}

async function binaryHelp(ctx: Ctx, connector: ConnectorRow, command: string | undefined): Promise<string> {
  if (command === 'exec') return commandHelp(connector.name, builtinDetail('exec', binaryExec));
  const line = programHelpLine(connector, command);
  const run = await runShell(await shellFor(ctx), line, ctx.job.workspace.path, programHelpTimeoutMs, ctx.job.signal);
  const program = `${line}:\n${truncate(run.output).replace(/[\r\n]+$/, '')}`;
  if (command !== undefined) return program;
  return `${connectorHelp(connector.name, connector.description, [{ name: 'exec', description: binaryExec.description }])}\n\n${program}`;
}

async function helpText(ctx: Ctx, name: string, command: string | undefined): Promise<string> {
  const builtin = builtinConnectors.find((candidate) => candidate === name);
  if (builtin !== undefined) return builtinHelp(ctx, builtin, command);
  const connector = (await activeConnectors(ctx)).find((candidate) => candidate.name === name);
  if (connector === undefined) throw notFound(`There is no connector ${name}.`, { connector: name });
  return connector.kind === 'binary' ? binaryHelp(ctx, connector, command) : commandsHelp(ctx, connector, command);
}

export function registerConnectorHelp(ctx: Ctx): void {
  ctx.registerQuery('kvcoder.connector.help.get', {
    description: "Gives a connector's help: its commands, or one command's payload, result, and examples.",
    input: z.strictObject({ connector: z.string().min(1).describe('The connector to describe.'), command: z.string().min(1).describe('The one command to describe; the whole connector when left out.').exactOptional() }),
    output: z.object({ text: z.string() }),
    handle: async ({ connector, command }) => ({ text: await helpText(ctx, connector, command) }),
  });
}
