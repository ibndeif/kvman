import { z } from '@kvman/sdk';
import { maxTimeoutMs } from './shell-command.ts';

// The agent's one tool (plan 08 §8.2): `bash { title, description, command, timeoutMs? }`, or `powershell` on Windows.

export const shellArgsSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  command: z.string().min(1),
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
        title: { type: 'string', description: 'Two to six words in the imperative saying what this does, for the person ("Create the todo file"). Write it first.' },
        description: { type: 'string', description: 'One sentence saying what the command does and why, for the person.' },
        command: { type: 'string', description: 'The command to run.' },
        timeoutMs: { type: 'integer', minimum: 1, maximum: maxTimeoutMs, description: 'How long it may run, in milliseconds (default 120000).' },
      },
      required: ['title', 'description', 'command'],
      additionalProperties: false,
    },
  };
}
