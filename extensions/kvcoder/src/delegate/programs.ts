import { z } from '@kvman/sdk';
import { truncate } from '../result-text.ts';
import type { ProgramWorker } from './workers.ts';

// How kvcoder runs each kind of program worker and reads its answer (plan 08 §8.5, ADR 0021, 31 and 32). The task
// follows `--`, so one that starts with a dash is still the task.

export type CommandLine = { command: string; args: string[] };

const option = (name: string, value: string | null): string[] => (value === null ? [] : [name, value]);

/** The command line that runs `task` with a worker. */
export function commandLine(worker: ProgramWorker, task: string): CommandLine {
  if (worker.kind === 'opencode') {
    const text = worker.instructions === '' ? task : `${worker.instructions}\n\n${task}`;
    return { command: 'opencode', args: ['run', '--format', 'json', ...option('--model', worker.model), ...option('--agent', worker.agent), ...(worker.autoApprove ? ['--auto'] : []), '--', text] };
  }
  const instructions = option('--append-system-prompt', worker.instructions === '' ? null : worker.instructions);
  if (worker.kind === 'pi') {
    const tools = option('--tools', worker.tools === null ? null : worker.tools.join(','));
    return { command: 'pi', args: ['-p', ...option('--model', worker.model), ...option('--thinking', worker.thinking), ...tools, ...instructions, '--', task] };
  }
  return { command: 'claude', args: ['-p', '--permission-mode', worker.permissionMode, ...option('--model', worker.model), ...option('--effort', worker.effort), ...instructions, '--', task] };
}

/** The command line that checks a kind's program is installed (ADR 0021, 37). */
export const checkCommand = (kind: ProgramWorker['kind']): CommandLine => ({ command: kind, args: ['--version'] });

const eventSchema = z.object({ type: z.string(), part: z.object({ text: z.string().exactOptional() }).exactOptional(), error: z.object({ message: z.string().exactOptional() }).exactOptional() });

function eventOf(line: string): z.output<typeof eventSchema> | undefined {
  if (!line.trimStart().startsWith('{')) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
  const parsed = eventSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

// opencode prints one JSON event per line: the answer is the text after the last tool call, and an error event's
// message is a reason. A line that isn't an event is ignored.
function opencodeAnswer(stdout: string): { answer: string; reasons: string[] } {
  let texts: string[] = [];
  const reasons: string[] = [];
  for (const line of stdout.split('\n')) {
    const event = eventOf(line);
    if (event === undefined) continue;
    if (event.type === 'tool_use') texts = [];
    else if (event.type === 'text' && event.part?.text !== undefined) texts.push(event.part.text);
    else if (event.type === 'error' && event.error?.message !== undefined) reasons.push(event.error.message);
  }
  return { answer: texts.join('\n\n').trim(), reasons };
}

/** A program's answer from its standard output, and the reasons it gave for a failure. */
export function answerOf(kind: ProgramWorker['kind'], stdout: string): { answer: string; reasons: string[] } {
  return kind === 'opencode' ? opencodeAnswer(stdout) : { answer: stdout.trim(), reasons: [] };
}

/** How a program's run ended. */
export type ProgramEnd = { stdout: string; stderr: string; exitCode: number | null; timedOut: boolean; startError: string | null };

/** What a run returns to the model, and whether it is an error (ADR 0021, 32). */
export function runResult(worker: { name: string; kind: ProgramWorker['kind']; timeoutMs: number }, end: ProgramEnd): { text: string; isError: boolean } {
  if (end.startError !== null) return { text: `${worker.name} could not start: ${end.startError}`, isError: true };
  const { answer, reasons } = answerOf(worker.kind, end.stdout);
  if (!end.timedOut && end.exitCode === 0) return answer === '' ? { text: `${worker.name} returned no answer`, isError: true } : { text: truncate(answer), isError: false };
  const first = end.timedOut ? `${worker.name} timed out after ${Math.round(worker.timeoutMs / 1000)} s` : `${worker.name} exited with code ${String(end.exitCode)}`;
  return { text: truncate([first, ...reasons, end.stderr.trim(), answer].filter((part) => part !== '').join('\n')), isError: true };
}
