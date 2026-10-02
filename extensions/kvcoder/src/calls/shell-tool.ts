import { z } from '@kvman/sdk';
import type { JsonValue } from '../connector-line.ts';
import { maxTimeoutMs } from './shell-command.ts';

// The agent's one tool (plan 08 §8.2): `bash { command, title?, description?, risky?, mode?, timeoutMs? }`, or `powershell` on
// Windows. A call that leaves out its words still runs, and one that leaves out `risky` counts as risky (ADR 0009, 212).

export const shellArgsSchema = z.object({
  title: z.string().min(1).exactOptional(),
  description: z.string().min(1).exactOptional(),
  command: z.string().min(1),
  risky: z.boolean().default(true),
  mode: z.enum(['sync', 'async']).exactOptional(),
  timeoutMs: z.number().int().positive().exactOptional(),
});

export type ShellArgs = z.output<typeof shellArgsSchema>;

// What each argument must be, as a failed call says it (ADR 0009, 186).
const requirements: Record<string, string> = {
  title: 'two to six words in the imperative, for the person',
  description: 'one sentence saying what the command does and why, for the person',
  command: 'the command to run',
  risky: "true or false: true when the call could lose or damage something that isn't your own work, or reaches outside the workspace",
  mode: '"sync" or "async"',
  timeoutMs: 'a positive whole number of milliseconds',
};

const titleLimit = 60;

const blank = (value: JsonValue | undefined): boolean => typeof value === 'string' && value.trim() === '';

// A blank title or description is a missing one, and a call that leaves out its title gets the start of its description,
// so it runs instead of failing (ADR 0009, 186 and 212).
function withTitle(args: Record<string, JsonValue>): Record<string, JsonValue> {
  const { title, description, ...rest } = args;
  const words = {
    ...(blank(title) || title === undefined ? {} : { title }),
    ...(blank(description) || description === undefined ? {} : { description }),
  };
  if ('title' in words || typeof description !== 'string' || blank(description)) return { ...rest, ...words };
  const text = description.trim();
  return { ...rest, ...words, title: text.length > titleLimit ? `${text.slice(0, titleLimit)}…` : text };
}

export type ParsedShellArgs = { success: true; data: ShellArgs } | { success: false; problems: string };

/** A call's arguments, with a missing title derived and a missing `risky` true, or what is wrong with them and what each field must be. */
export function parseShellArgs(raw: Record<string, JsonValue>): ParsedShellArgs {
  const parsed = shellArgsSchema.safeParse(withTitle(raw));
  if (parsed.success) return { success: true, data: parsed.data };
  const problems = parsed.error.issues.map((issue) => {
    const field = String(issue.path[0] ?? 'arguments');
    const needed = requirements[field];
    return `${issue.path.join('.') || 'arguments'}: ${issue.message}${needed === undefined ? '' : ` (it must be ${needed})`}`;
  });
  return { success: false, problems: problems.join('; ') };
}

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
        '` creates a file. Use a connector instead of the shell whenever one covers the task, and the shell for the rest. `<connector> -h` lists a connector\'s commands. Give a whole file or document as the raw heredoc body after the JSON, so it needs no escaping.',
    ].join('\n'),
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Optional. Two to six words in the imperative saying what this does, for the person ("Create the todo file"). Write it first.' },
        description: { type: 'string', description: 'Optional. One sentence saying what the command does and why, for the person.' },
        command: { type: 'string', description: 'The shell command, or a connector call.' },
        risky: { type: 'boolean', description: "true when this could lose or damage something that isn't your own work, or reaches outside the workspace: deleting or overwriting files you didn't create, sudo, installing globally, git push --force or reset --hard, changing a remote. The person is asked first. Otherwise false. Left out, it counts as true." },
        mode: { type: 'string', enum: ['sync', 'async'], description: "'sync' (default) waits for the command and stops anything it leaves running. 'async' keeps a server or any long-running command running in the background and returns its job id at once; read or stop it with `jobs get <id>` and `jobs cancel <id>`." },
        timeoutMs: { type: 'integer', minimum: 1, maximum: maxTimeoutMs, description: 'How long a sync command may run, in milliseconds (default 120000). Ignored for async.' },
      },
      required: ['command'],
      additionalProperties: false,
    },
  };
}
