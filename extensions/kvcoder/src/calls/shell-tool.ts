import { z } from '@kvman/sdk';
import { maxTimeoutMs } from './shell-command.ts';

// The agent's one tool (plan 08 §8.2): `bash { title, description, command, risky, mode?, timeoutMs? }`, or `powershell` on Windows.

export const shellArgsSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  command: z.string().min(1),
  risky: z.boolean(),
  mode: z.enum(['sync', 'async']).exactOptional(),
  timeoutMs: z.number().int().positive().exactOptional(),
});

export type ShellArgs = z.output<typeof shellArgsSchema>;

/** The connector call the tool's description shows: one line, so it reads the same in bash and in PowerShell. */
export const connectorExample = 'fs write \'{"path":"notes/todo.md","content":"- one\\n"}\'';

export function shellTool(name: 'bash' | 'powershell') {
  const shell = name === 'bash' ? 'bash' : 'PowerShell';
  return {
    name,
    description: [
      `Runs one ${shell} command in the workspace folder and returns its combined output and exit code.`,
      '',
      "Connectors come first. A connector is a word kvcoder runs itself, listed in the system prompt, and it is typed here too: `<connector> <command> '<json>'`, alone on its line (no pipes, &&, ;, or redirection around it). For example, `" +
        connectorExample +
        '` creates a file. Use a connector instead of the shell whenever one covers the task, and the shell for the rest. `<connector> -h` lists a connector\'s commands.',
    ].join('\n'),
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Two to six words in the imperative saying what this does, for the person ("Create the todo file"). Write it first.' },
        description: { type: 'string', description: 'One sentence saying what the command does and why, for the person.' },
        command: { type: 'string', description: 'The shell command, or a connector call.' },
        risky: { type: 'boolean', description: "true when this could lose or damage something that isn't your own work, or reaches outside the workspace: deleting or overwriting files you didn't create, sudo, installing globally, git push --force or reset --hard, changing a remote. The person is asked first. Otherwise false." },
        mode: { type: 'string', enum: ['sync', 'async'], description: "'sync' (default) waits for the command and stops anything it leaves running. 'async' keeps a server or any long-running command running in the background and returns its job id at once; read or stop it with `jobs get <id>` and `jobs cancel <id>`." },
        timeoutMs: { type: 'integer', minimum: 1, maximum: maxTimeoutMs, description: 'How long a sync command may run, in milliseconds (default 120000). Ignored for async.' },
      },
      required: ['title', 'description', 'command', 'risky'],
      additionalProperties: false,
    },
  };
}
