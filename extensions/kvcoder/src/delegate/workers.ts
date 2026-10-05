import { ProblemError, z, type Ctx } from '@kvman/sdk';
import { thinkingSchema } from '../schemas/records.ts';
import { wordSchema } from '../schemas/registry.ts';

// The workers the `delegate` connector hands tasks to (plan 08 §8.5, ADR 0021, 4, 5, 7, and 20): the setting
// `kvcoder.delegate.workers`. A worker runs a subagent with its own instructions, connectors, model, and thinking, or
// a program on this computer, and is available while it is turned on.

/** The most a worker's instructions hold, a section's cap. */
const instructionsLimit = 16 * 1024;

const common = {
  name: wordSchema,
  description: z.string().min(1),
  enabled: z.boolean(),
  instructions: z.string().refine((text) => Buffer.byteLength(text, 'utf8') <= instructionsLimit, 'Instructions hold at most 16 KB.'),
};

/** A worker that runs a subagent: a child session with its own connectors, model, and thinking. */
export const subagentWorkerSchema = z.strictObject({ ...common, kind: z.literal('subagent'), connectors: z.array(z.string()).nullable(), model: z.string().min(1).nullable(), thinking: thinkingSchema.nullable() });

// A worker that runs a program on this computer (ADR 0021, 12, 13, and 31): whether a run asks first, how long it may
// take, and the flags that matter, each `null` to leave its flag out.
const program = { ...common, approval: z.enum(['ask', 'auto']), timeoutMs: z.number().int().min(60_000).max(7_200_000) };
const flag = z.string().min(1).nullable();

export const opencodeWorkerSchema = z.strictObject({ ...program, kind: z.literal('opencode'), model: flag, agent: flag, autoApprove: z.boolean() });
export const piWorkerSchema = z.strictObject({ ...program, kind: z.literal('pi'), model: flag, thinking: z.enum(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']).nullable(), tools: z.array(z.string().min(1)).nullable() });
export const claudeWorkerSchema = z.strictObject({
  ...program,
  kind: z.literal('claude'),
  model: flag,
  effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).nullable(),
  permissionMode: z.enum(['acceptEdits', 'auto', 'bypassPermissions', 'dontAsk', 'plan']),
});

/** One worker: a subagent, or a program of one of the kinds kvcoder knows (ADR 0021, 3). */
export const workerSchema = z.discriminatedUnion('kind', [subagentWorkerSchema, opencodeWorkerSchema, piWorkerSchema, claudeWorkerSchema]);

/** The `kvcoder.delegate.workers` setting: each worker has its own name. */
export const workersSchema = z.array(workerSchema).refine((workers) => new Set(workers.map((worker) => worker.name)).size === workers.length, 'Each worker needs its own name.');

export type Worker = z.output<typeof workerSchema>;
export type SubagentWorker = z.output<typeof subagentWorkerSchema>;
export type ProgramWorker = Exclude<Worker, SubagentWorker>;

/** Whether a worker runs a program, not a subagent. */
export const isProgram = (worker: Worker): worker is ProgramWorker => worker.kind !== 'subagent';

/** The name a program worker's check has among a session's checks (ADR 0021, 37). */
export const workerCheckName = (name: string): string => `worker:${name}`;

const shipped = (name: string, description: string, instructions: string): SubagentWorker => ({ name, description, enabled: true, kind: 'subagent', instructions, connectors: null, model: null, thinking: null });

/** The workers kvcoder ships with: they differ by their instructions only (ADR 0021, 5). */
export const shippedWorkers: SubagentWorker[] = [
  shipped('general', 'Any separate, self-contained task', ''),
  shipped(
    'ui-ux',
    'Designs screens and flows',
    "You are a UI/UX designer. Design the screens and flows the task asks for, from the person's experience: what they see, what they do next, and every empty, loading, and error state. Follow the project's existing components, styles, and wording. Show the design in an artifact, as a page when layout matters. Don't change the project's files unless the task asks you to build the design.",
  ),
  shipped(
    'architect',
    'Studies the code and proposes a design',
    "You are a software architect. Read the code the task touches before you propose anything. Return a design: the parts, their responsibilities, the shapes that pass between them, the trade-offs you weighed, and the risks. Prefer the simplest design that fits the project's conventions. Don't edit the project's files.",
  ),
  shipped(
    'tester',
    'Writes and runs tests',
    "You are a test engineer. Write the tests the task asks for in the project's own test setup, each checking one behavior with real values, and run them. Report each failure with its cause. Don't change production code to make a test pass; report the defect.",
  ),
  shipped(
    'reviewer',
    'Reviews changes with a fresh look',
    "You are a code reviewer. Read the changes the task names, and the code around them. Report defects by severity, each with its file and line, what is wrong, and what you expect instead: correctness first, then security, then the project's conventions. Say so when you find nothing. Don't edit the project's files.",
  ),
];

/** The workers of the job's workspace, in the setting's order. */
export async function listedWorkers(ctx: Ctx): Promise<Worker[]> {
  return workersSchema.parse(await ctx.settings.get('kvcoder.delegate.workers'));
}

type Checks = readonly { name: string; passed: boolean }[] | null;

/** The workers a session can use: turned on, and for a program, one whose check passed (ADR 0021, 17). */
export async function availableWorkers(ctx: Ctx, checks: Checks): Promise<Worker[]> {
  const passed = new Set((checks ?? []).filter((check) => check.passed).map((check) => check.name));
  return (await listedWorkers(ctx)).filter((worker) => worker.enabled && (!isProgram(worker) || passed.has(workerCheckName(worker.name))));
}

function notFound(name: string, names: readonly string[]): ProblemError {
  return new ProblemError({ code: 'kvcoder/WORKER_NOT_FOUND', message: `There is no worker ${name}. ${names.length === 0 ? 'No worker is available.' : `The workers are: ${names.join(', ')}.`}`, params: { worker: name } });
}

/** One available worker by name, or `kvcoder/WORKER_NOT_FOUND` naming the ones there are. */
export async function availableWorker(ctx: Ctx, checks: Checks, name: string): Promise<Worker> {
  const workers = await availableWorkers(ctx, checks);
  const found = workers.find((worker) => worker.name === name);
  if (found === undefined) throw notFound(name, workers.map((worker) => worker.name));
  return found;
}

/** One worker of the list by name, turned on or not. */
export async function listedWorker(ctx: Ctx, name: string): Promise<Worker> {
  const workers = await listedWorkers(ctx);
  const found = workers.find((worker) => worker.name === name);
  if (found === undefined) throw notFound(name, workers.map((worker) => worker.name));
  return found;
}
