import { z, type CommandInputOf, type Ctx, type OutputOf, type ScheduleCall, type ScheduleTiming } from '@kvman/sdk';
import { requireJob, requireWritable } from '../jobs/current-job.ts';
import type { Owner, Registration } from '../jobs/registry.ts';
import { runJob, type JobEnvironment } from '../jobs/run-job.ts';
import { kernelProblem } from '../problems.ts';
import type { WorkerRequest } from '../workers/protocol.ts';
import type { IdGenerator } from '../ids.ts';

// The job calls of `ctx` (plan 03 §3.2). A sync call runs here, on the calling job's worker; queued jobs and schedules
// are rows the main thread writes (ADR 0009, 19), after this worker has checked the call.

export type JobCallServices = { environment: JobEnvironment; ids: IdGenerator; request: (request: WorkerRequest) => Promise<unknown> };

const timingSchema = z.union([
  z.strictObject({ at: z.date().refine((date) => !Number.isNaN(date.getTime()), 'at must be a valid date'), key: z.string().min(1).optional() }),
  z.strictObject({ cron: z.string().min(1), key: z.string().min(1).optional() }),
]);

function commandFor(services: JobCallServices, owner: Owner, name: string): Registration {
  const registration = services.environment.registry.jobs.get(name);
  if (registration === undefined) throw kernelProblem('NOT_FOUND', `There is no command ${name}.`, { name });
  if (registration.kind !== 'command') throw kernelProblem('NOT_A_COMMAND', `${name} is a query; only commands can be queued or scheduled.`, { name });
  if (!registration.public && registration.owner !== owner.name) throw kernelProblem('NOT_PUBLIC', `${name} is private to ${registration.owner}.`, { name });
  if (registration.syncOnly) throw kernelProblem('VALIDATION_FAILED', `${name} runs only as a sync call; it can't be queued or scheduled.`, { name });
  return registration;
}

export function jobCalls(owner: Owner, services: JobCallServices): Pick<Ctx, 'exec' | 'execAsync' | 'schedule' | 'cancel'> {
  const exec = async <Name extends string>(name: Name, input: unknown) => {
    const parent = requireJob('ctx.exec');
    const output = await runJob(services.environment, {
      id: services.ids(),
      rootId: parent.rootId,
      name,
      input,
      workspace: parent.workspace,
      caller: { kind: 'extension', name: owner.name },
      parent,
      signal: parent.signal,
      fromHandler: parent.fromHandler,
      handlerExtension: undefined,
    });
    // The kernel checked the output against the registered schema; the declared type is the callee's promise.
    return output as OutputOf<Name>;
  };

  const execAsync = async <Name extends string>(name: Name, input: CommandInputOf<Name>) => {
    const job = requireJob('ctx.execAsync');
    requireWritable(job, 'ctx.execAsync');
    const { retries } = commandFor(services, owner, name);
    const request = { kind: 'queue-job', name, input, workspaceId: job.workspace.id, caller: { kind: 'extension', name: owner.name }, retries, fromHandler: job.fromHandler } as const;
    return z.string().parse(await services.request(request));
  };

  const schedule = async <Name extends string>(name: Name, input: CommandInputOf<Name>, timing: ScheduleTiming): Promise<string> => {
    const job = requireJob('ctx.schedule');
    requireWritable(job, 'ctx.schedule');
    const { retries } = commandFor(services, owner, name);
    const parsed = timingSchema.safeParse(timing);
    if (!parsed.success) throw kernelProblem('VALIDATION_FAILED', 'A schedule needs { at: Date } or { cron: string }, with an optional key.');
    const when = 'at' in parsed.data ? { at: parsed.data.at.toISOString() } : { cron: parsed.data.cron };
    const key = parsed.data.key === undefined ? {} : { key: parsed.data.key };
    const request = { kind: 'schedule', name, input, timing: when, ...key, workspaceId: job.workspace.id, owner: owner.name, retries, fromHandler: job.fromHandler } as const;
    return z.string().parse(await services.request(request));
  };

  const cancelSchedule = async (id: string): Promise<void> => {
    requireWritable(requireJob('ctx.schedule.cancel'), 'ctx.schedule.cancel');
    await services.request({ kind: 'cancel-schedule', id, owner: owner.name });
  };

  const scheduleCall: ScheduleCall = Object.assign(schedule, { cancel: cancelSchedule });
  return {
    exec,
    execAsync,
    schedule: scheduleCall,
    cancel: async (jobId) => {
      requireJob('ctx.cancel');
      await services.request({ kind: 'cancel-job', jobId });
    },
  };
}
