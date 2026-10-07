import type { Caller } from '@kvman/sdk';
import type { Clock } from './clock.ts';
import type { Dispatcher } from './jobs/dispatcher.ts';
import { kernelProblem } from './problems.ts';
import type { PresetStore } from './preset-edit/preset-store.ts';
import type { ProcessService } from './processes/process-service.ts';
import type { ScheduleRows } from './schedules/schedule-rows.ts';
import type { SecretsFile } from './secrets/secrets-file.ts';
import type { RegistrySummary, WorkerRequest } from './workers/protocol.ts';
import type { Workspaces } from './workspaces/workspaces.ts';

// What the main thread does for a worker (ADR 0009, 19), and the checks it makes for calls from outside a worker.

export type KernelRequestServices = {
  dispatcher: Dispatcher;
  schedules: ScheduleRows;
  secrets: SecretsFile;
  clock: Clock;
  workspaces: Workspaces;
  processes: ProcessService;
  preset: PresetStore;
  health: () => unknown;
  requestRestart: () => void;
};

export async function answerWorker(services: KernelRequestServices, request: WorkerRequest): Promise<unknown> {
  switch (request.kind) {
    case 'write-secret':
      if (request.write.action === 'set') services.secrets.set(request.write.extension, request.write.name, request.write.value);
      else services.secrets.delete(request.write.extension, request.write.name);
      return null;
    case 'queue-job':
      return services.dispatcher.queueAfterReply({ ...request, runAt: services.clock.now() });
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
    // A new workspace's `kernel.workspace.opened` handler jobs are queued with its row; a reopened one's paused work resumes.
    case 'open-workspace':
      return services.dispatcher.deliverAlong((deliverIn) =>
        services.workspaces.open(request.path, (workspaceId) => deliverIn('kernel.workspace.opened', { workspaceId }, workspaceId)),
      );
    case 'close-workspace':
      services.workspaces.close(request.workspaceId);
      return null;
    case 'preset-get':
      return services.preset.get();
    case 'preset-install':
      return services.preset.install(request.source);
    case 'preset-uninstall':
      return services.preset.uninstall(request.name);
    case 'preset-settings-set':
      return services.preset.setSetting(request.key, request.value, request.registered);
    case 'preset-settings-reset':
      return services.preset.resetSetting(request.key, request.required);
    case 'preset-save':
      return services.preset.save(request.preset, request.replace);
    case 'health':
      return services.health();
    case 'restart':
      services.requestRestart();
      return null;
    case 'start-process':
      return services.processes.start(request.extension, request.workspace, request.name, { ...request.options, cwd: request.options.cwd });
    case 'stop-process':
      await services.processes.stop(request.extension, request.workspaceId, request.name);
      return null;
  }
}

// A command queued from outside a worker (a test or HTTP): it must exist, be a command, be callable by the caller, and
// be allowed to run queued.
export function queuableCommand(summary: RegistrySummary, name: string, caller: Caller): { retries: number } {
  const job = summary.jobs.find((entry) => entry.name === name);
  if (job === undefined) throw kernelProblem('NOT_FOUND', `There is no command ${name}.`, { name });
  if (job.kind !== 'command') throw kernelProblem('NOT_A_COMMAND', `${name} is a query; only commands can be queued.`, { name });
  const own = caller.kind === 'extension' && caller.name === job.owner;
  if (!job.public && caller.kind !== 'kernel' && !own) throw kernelProblem('NOT_PUBLIC', `${name} is private to ${job.owner}.`, { name });
  if (job.syncOnly) throw kernelProblem('VALIDATION_FAILED', `${name} runs only as a sync call; it can't be queued.`, { name });
  return { retries: job.retries };
}
