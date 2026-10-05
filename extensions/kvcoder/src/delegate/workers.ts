import { ProblemError, z, type Ctx } from '@kvman/sdk';
import { thinkingSchema } from '../schemas/records.ts';
import { wordSchema } from '../schemas/registry.ts';

// The workers the `delegate` connector hands tasks to (plan 08 §8.5, ADR 0021, 4, 5, 7, and 20): the setting
// `kvcoder.delegate.workers`. A worker runs a subagent with its own instructions, connectors, model, and thinking, and
// is available while it is turned on.

/** The most a worker's instructions hold, a section's cap. */
const instructionsLimit = 16 * 1024;

/** One worker: a subagent with a configuration of its own. */
export const workerSchema = z.strictObject({
  name: wordSchema,
  description: z.string().min(1),
  enabled: z.boolean(),
  kind: z.literal('subagent'),
  instructions: z.string().refine((text) => Buffer.byteLength(text, 'utf8') <= instructionsLimit, 'Instructions hold at most 16 KB.'),
  connectors: z.array(z.string()).nullable(),
  model: z.string().min(1).nullable(),
  thinking: thinkingSchema.nullable(),
});

/** The `kvcoder.delegate.workers` setting: each worker has its own name. */
export const workersSchema = z.array(workerSchema).refine((workers) => new Set(workers.map((worker) => worker.name)).size === workers.length, 'Each worker needs its own name.');

export type Worker = z.output<typeof workerSchema>;

const shipped = (name: string, description: string, instructions: string): Worker => ({ name, description, enabled: true, kind: 'subagent', instructions, connectors: null, model: null, thinking: null });

/** The workers kvcoder ships with: they differ by their instructions only (ADR 0021, 5). */
export const shippedWorkers: Worker[] = [
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

/** The workers of the job's workspace that are turned on, in the setting's order. */
export async function availableWorkers(ctx: Ctx): Promise<Worker[]> {
  return workersSchema.parse(await ctx.settings.get('kvcoder.delegate.workers')).filter((worker) => worker.enabled);
}

/** One available worker by name, or `kvcoder/WORKER_NOT_FOUND` naming the ones there are. */
export async function availableWorker(ctx: Ctx, name: string): Promise<Worker> {
  const workers = await availableWorkers(ctx);
  const found = workers.find((worker) => worker.name === name);
  if (found !== undefined) return found;
  const names = workers.map((worker) => worker.name).join(', ');
  throw new ProblemError({ code: 'kvcoder/WORKER_NOT_FOUND', message: `There is no worker ${name}. ${names === '' ? 'No worker is available.' : `The workers are: ${names}.`}`, params: { worker: name } });
}
