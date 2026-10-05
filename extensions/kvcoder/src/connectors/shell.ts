import { z, type Ctx } from '@kvman/sdk';
import { lineRunOptions, lineRunSchema, runLine } from '../calls/line-run.ts';
import { lineCallInput, lineResult, type ConnectorCommand } from './connector-command.ts';
import { background, risky, timeoutMs } from './payload-fields.ts';

// The `shell` connector (plan 08 §8.3, ADR 0011, 2): `exec` runs one whole line in the real shell, in the workspace
// folder, after the person's approval when the call is risky.

/** What the prompt's index says the connector is for; it names the shell this run uses. */
export const shellDescription = (shell: 'bash' | 'powershell'): string =>
  `Run a line in the real shell (${shell === 'bash' ? 'bash' : 'PowerShell'}) in the workspace folder: build, test, install, or anything no other connector covers. Set background to true for a server or any command that keeps running; to show the person an app you started, give its address to artifact write with the format url.`;

const execPayload = z.strictObject({ line: z.string().min(1).describe('The whole shell line to run, with any pipes, &&, or redirection.'), background, timeoutMs, risky });

export const shellCommands = {
  exec: { registration: 'kvcoder.shell.run', description: 'Runs one line in the real shell, in the workspace folder.', payload: execPayload, asks: true, result: lineResult },
} satisfies Record<string, ConnectorCommand>;

export function registerShellConnector(ctx: Ctx): void {
  ctx.registerCommand('kvcoder.shell.run', {
    description: shellCommands.exec.description,
    input: lineCallInput(execPayload),
    output: lineRunSchema,
    ...lineRunOptions,
    handle: ({ sessionId, description, payload }) => runLine(ctx, { sessionId, description }, payload.line, payload),
  });
}
