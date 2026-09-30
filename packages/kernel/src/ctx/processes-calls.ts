import { z, type Ctx } from '@kvman/sdk';
import { requireJob, requireWritable } from '../jobs/current-job.ts';
import type { Owner } from '../jobs/registry.ts';
import { defaultTailLines, processLogPath, tailOf } from '../processes/process-log.ts';
import { listOwnProcesses } from '../processes/process-rows.ts';
import { kernelProblem } from '../problems.ts';
import type { Connection } from '../storage/database.ts';
import { validationFailed } from '../store/json-values.ts';
import type { WorkerRequest } from '../workers/protocol.ts';

// `ctx.processes` (plan 02 §2.16, ADR 0009, 27 and 30): the main thread starts and stops the processes, which outlive
// jobs and workers; a worker reads their rows and logs itself.

export type ProcessCallServices = { connection: Connection; home: string; request: (request: WorkerRequest) => Promise<unknown> };

const namePattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

const startSchema = z.strictObject({
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  cwd: z.string().min(1).optional(),
  env: z.record(z.string(), z.string()).optional(),
});

const startedSchema = z.object({ name: z.string(), pid: z.number().int(), startedAt: z.string() });

function checkName(name: string): void {
  if (typeof name !== 'string' || !namePattern.test(name)) {
    throw kernelProblem('VALIDATION_FAILED', 'A process name is lowercase kebab case, such as "preview".', { name: String(name) });
  }
}

export function processesCalls(owner: Owner, services: ProcessCallServices): Ctx['processes'] {
  return {
    start: async (name, options) => {
      const job = requireJob('ctx.processes.start');
      requireWritable(job, 'ctx.processes.start');
      checkName(name);
      const parsed = startSchema.safeParse(options);
      if (!parsed.success) throw validationFailed(`The options of the process ${name}`, parsed.error);
      const start = { command: parsed.data.command, args: parsed.data.args ?? [], env: parsed.data.env ?? {}, ...(parsed.data.cwd === undefined ? {} : { cwd: parsed.data.cwd }) };
      const request = { kind: 'start-process', extension: owner.name, workspace: job.workspace, name, options: start } as const;
      return startedSchema.parse(await services.request(request));
    },
    stop: async (name) => {
      const job = requireJob('ctx.processes.stop');
      requireWritable(job, 'ctx.processes.stop');
      checkName(name);
      await services.request({ kind: 'stop-process', extension: owner.name, workspaceId: job.workspace.id, name });
    },
    list: async () => listOwnProcesses(services.connection, owner.name, requireJob('ctx.processes.list').workspace.id),
    log: async (name, options) => {
      const job = requireJob('ctx.processes.log');
      checkName(name);
      const tail = z.number().int().positive().default(defaultTailLines).safeParse(options?.tail);
      if (!tail.success) throw validationFailed('The tail of a process log', tail.error);
      return tailOf(processLogPath(services.home, owner.name, job.workspace.id, name), name, tail.data);
    },
  };
}
