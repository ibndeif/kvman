import { z } from '@kvman/sdk';
import { maxTimeoutMs } from './shell-command.ts';

// The agent's one tool (plan 08 §8.2): `bash { command, description, timeoutMs? }`, or `powershell` on Windows.

export const shellArgsSchema = z.object({
  command: z.string().min(1),
  description: z.string(),
  timeoutMs: z.number().int().positive().exactOptional(),
});

export type ShellArgs = z.output<typeof shellArgsSchema>;

export function shellTool(name: 'bash' | 'powershell') {
  return {
    name,
    description: `Runs one ${name === 'bash' ? 'bash' : 'PowerShell'} command in the workspace folder and returns its combined output and exit code. Connector calls are typed here too, each standing alone on its line.`,
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The command to run.' },
        description: { type: 'string', description: 'What the command does, in a few words, for the person.' },
        timeoutMs: { type: 'integer', minimum: 1, maximum: maxTimeoutMs, description: 'How long it may run, in milliseconds (default 120000).' },
      },
      required: ['command', 'description'],
      additionalProperties: false,
    },
  };
}
