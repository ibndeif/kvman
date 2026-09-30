import type { Caller } from '@kvman/sdk';
import type { Clock } from './clock.ts';
import type { Dispatcher } from './jobs/dispatcher.ts';
import { kernelProblem } from './problems.ts';
import type { ScheduleRows } from './schedules/schedule-rows.ts';
import type { SecretsFile } from './secrets/secrets-file.ts';
import type { RegistrySummary, WorkerRequest } from './workers/protocol.ts';

// What the main thread does for a worker (ADR 0009, 19), and the checks it makes for calls from outside a worker.

export type KernelRequestServices = { dispatcher: Dispatcher; schedules: ScheduleRows; secrets: SecretsFile; clock: Clock };

export async function answerWorker(services: KernelRequestServices, request: WorkerRequest): Promise<unknown> {
  switch (request.kind) {
    case 'write-secret':
      if (request.write.action === 'set') services.secrets.set(request.write.extension, request.write.name, request.write.value);
      else services.secrets.delete(request.write.extension, request.write.name);
      return null;
    case 'queue-job':
      return services.dispatcher.queue({ ...request, runAt: services.clock.now() });
    case 'schedule': {
      const { kind: _kind, ...schedule } = request;
      const id = services.schedules.upsert(schedule);
      services.dispatcher.wake();
      return id;
    }
    case 'cancel-schedule':
      services.schedules.cancel(request.id, request.owner);
      return null;
    case 'cancel-job':
      services.dispatcher.cancel(request.jobId);
      return null;
  }
}

// A command queued from outside a worker (a test or HTTP): it must exist, be a command, and be callable by the caller.
export function queuableCommand(summary: RegistrySummary, name: string, caller: Caller): { retries: number } {
  const job = summary.jobs.find((entry) => entry.name === name);
  if (job === undefined) throw kernelProblem('NOT_FOUND', `There is no command ${name}.`, { name });
  if (job.kind !== 'command') throw kernelProblem('NOT_A_COMMAND', `${name} is a query; only commands can be queued.`, { name });
  const own = caller.kind === 'extension' && caller.name === job.owner;
  if (!job.public && caller.kind !== 'kernel' && !own) throw kernelProblem('NOT_PUBLIC', `${name} is private to ${job.owner}.`, { name });
  return { retries: job.retries };
}
