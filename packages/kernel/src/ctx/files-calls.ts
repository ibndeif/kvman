import type { Ctx } from '@kvman/sdk';
import { fileInWorkspace, unlinkAs } from '../files/file-access.ts';
import type { Files } from '../files/files.ts';
import { requireJob, requireWritable } from '../jobs/current-job.ts';
import type { Owner } from '../jobs/registry.ts';
import { kernelProblem } from '../problems.ts';

// `ctx.files` (plan 02 §2.7, ADR 0009, 24): files of the job's workspace, written with the extension as owner.
export function filesCalls(owner: Owner, files: Files): Ctx['files'] {
  const caller = { kind: 'extension', name: owner.name } as const;
  const own = (call: string, id: string) => fileInWorkspace(files, id, requireJob(call).workspace.id);
  return {
    write: async (name, data, type) => {
      const job = requireJob('ctx.files.write');
      requireWritable(job, 'ctx.files.write');
      if (typeof data !== 'string' && !(data instanceof Uint8Array)) throw kernelProblem('VALIDATION_FAILED', "A file's data is a Uint8Array or a string.");
      return files.write({ name, data, type, owner: caller, workspaceId: job.workspace.id });
    },
    get: async (id) => own('ctx.files.get', id),
    read: async (id) => files.read(own('ctx.files.read', id).id),
    path: async (id) => files.path(own('ctx.files.path', id).id),
    unlink: async (id) => {
      const job = requireJob('ctx.files.unlink');
      requireWritable(job, 'ctx.files.unlink');
      unlinkAs(files, id, job.workspace.id, caller);
    },
  };
}
