import { callerSchema, problemSchema, z, type HandlerPoint, type HandlerPoints, type HandlerRegistration } from '@kvman/sdk';
import { kernelProblem } from '../problems.ts';
import type { Owner, Registry, StartedJob } from './registry.ts';

// Handlers for the kernel's points (plan 02 §2.15): one per extension and point, run as async jobs.

const jobPointSchema = z.object({ jobId: z.string(), rootId: z.string(), name: z.string(), caller: callerSchema, workspaceId: z.string() });
const emptySchema = z.object({}).strict();

const pointInputSchemas: { [Point in HandlerPoint]: z.ZodType<HandlerPoints[Point]> } = {
  'kernel.job.failed': jobPointSchema.extend({ problem: problemSchema, attempts: z.number().int() }),
  'kernel.job.succeeded': jobPointSchema,
  'kernel.job.cancelled': jobPointSchema.extend({ reason: z.string() }),
  'kernel.process.exited': z.object({ extension: z.string(), workspaceId: z.string(), name: z.string(), exitCode: z.number().nullable(), signal: z.string().nullable() }),
  'kernel.workspace.opened': z.object({ workspaceId: z.string() }),
  'kernel.started': emptySchema,
  'kernel.stopping': emptySchema,
};

export const handlerPoints = Object.keys(pointInputSchemas);

export type HandlerEntry = {
  point: string;
  owner: string;
  description: string;
  retries: number;
  timeoutMs: number;
  start: (input: unknown) => StartedJob;
};

export type HandlerSummary = { point: string; extension: string; retries: number };

function isPoint(point: string): point is HandlerPoint {
  return Object.hasOwn(pointInputSchemas, point);
}

const registrationSchema = z.object({
  description: z.string().trim().min(1),
  handle: z.custom<(input: unknown) => unknown>((value) => typeof value === 'function', 'handle must be a function'),
  retries: z.number().int().nonnegative().optional(),
  timeoutMs: z.number().int().positive().optional(),
});

function invalid(owner: Owner, message: string): Error {
  return kernelProblem('EXTENSION_INVALID', `${owner.name}: ${message}`, { extension: owner.name });
}

export function registerHandler<Point extends HandlerPoint>(registry: Registry, owner: Owner, point: Point, registration: HandlerRegistration<Point>): void {
  if (registry.sealed) throw invalid(owner, `a handler for "${point}" was registered after the entry returned; registrations are sealed.`);
  if (!isPoint(point)) throw invalid(owner, `"${String(point)}" is not a kernel handler point.`);
  if (registry.handlers.some((entry) => entry.point === point && entry.owner === owner.name)) throw invalid(owner, `it registers two handlers for "${point}".`);
  const parsed = registrationSchema.safeParse(registration);
  if (!parsed.success) throw invalid(owner, `the handler for "${point}" is invalid (${z.prettifyError(parsed.error)}).`);
  const schema: z.ZodType<HandlerPoints[Point]> = pointInputSchemas[point];
  registry.handlers.push({
    point,
    owner: owner.name,
    description: parsed.data.description,
    retries: registration.retries ?? 3,
    timeoutMs: registration.timeoutMs ?? 600_000,
    start: (input) => {
      const checked = schema.safeParse(input);
      return checked.success ? { run: () => registration.handle(checked.data) } : { error: checked.error };
    },
  });
}

export function handlerSummaries(registry: Registry): HandlerSummary[] {
  return registry.handlers.map((entry) => ({ point: entry.point, extension: entry.owner, retries: entry.retries }));
}
