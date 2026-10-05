import { z, type Ctx } from '@kvman/sdk';
import { lineRunOptions, lineRunSchema, runLine } from '../calls/line-run.ts';
import { notFound } from '../problems.ts';
import { activeConnectors } from '../registry/register-connectors.ts';
import { lineCallInput, lineResult, type ConnectorCommand } from './connector-command.ts';
import { background, risky, timeoutMs } from './payload-fields.ts';

// A binary connector (plan 08 §8.4, ADR 0011, 5): a program on the system, registered by an extension or named in
// `kvcoder.connectors`. Every one has the same command besides `help`: `exec` runs `<name> <args>` in the real shell,
// with the approval, timeout, and background rules of `shell exec`.

const execPayload = z.strictObject({ args: z.string().describe("The program's arguments, as you would type them after its name.").exactOptional(), background, timeoutMs, risky });

export const binaryExec: ConnectorCommand = { registration: 'kvcoder.binary.run', description: 'Runs the program with the given arguments in the real shell, in the workspace folder.', payload: execPayload, asks: true, result: lineResult };

export function registerBinaryConnector(ctx: Ctx): void {
  ctx.registerCommand('kvcoder.binary.run', {
    description: binaryExec.description,
    input: lineCallInput(execPayload).extend({ connector: z.string().describe('The binary connector whose program runs.') }),
    output: lineRunSchema,
    ...lineRunOptions,
    handle: async ({ sessionId, description, connector, payload }) => {
      const binary = (await activeConnectors(ctx)).find((candidate) => candidate.name === connector && candidate.kind === 'binary');
      if (binary === undefined) throw notFound(`There is no binary connector ${connector}.`, { connector });
      const args = payload.args?.trim() ?? '';
      return runLine(ctx, { sessionId, description }, args === '' ? connector : `${connector} ${args}`, payload);
    },
  });
}
