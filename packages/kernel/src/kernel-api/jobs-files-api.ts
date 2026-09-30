import { kernelCommandSchemas, kernelQuerySchemas } from '@kvman/sdk';
import { fileInWorkspace, unlinkAs } from '../files/file-access.ts';
import { requireJob } from '../jobs/current-job.ts';
import { listJobs, readJob } from '../jobs/job-rows.ts';
import type { KernelApiServices } from './kernel-api-services.ts';
import type { KernelRegistrations } from './kernel-registrations.ts';

// `kernel.jobs.*` and `kernel.files.*` (plan 02 §2.12, ADR 0009, 24): lists are the call's workspace, newest first; a job
// is found by id in any workspace, a file only in the call's.
export function registerJobsFilesApi(api: KernelRegistrations, { connection, files }: KernelApiServices): void {
  api.query('kernel.jobs.get', kernelQuerySchemas['kernel.jobs.get'], 'Gets a job.', (input) => readJob(connection, input.id));
  api.query('kernel.jobs.list', kernelQuerySchemas['kernel.jobs.list'], "Lists this workspace's jobs, newest first.", (input) =>
    listJobs(connection, requireJob('kernel.jobs.list').workspace.id, input.status, input.limit),
  );
  api.query('kernel.files.get', kernelQuerySchemas['kernel.files.get'], 'Gets a file of this workspace.', (input) =>
    fileInWorkspace(files, input.id, requireJob('kernel.files.get').workspace.id),
  );
  api.query('kernel.files.list', kernelQuerySchemas['kernel.files.list'], "Lists this workspace's files, newest first.", (input) =>
    files.list(requireJob('kernel.files.list').workspace.id, input.limit),
  );
  api.command('kernel.files.unlink', kernelCommandSchemas['kernel.files.unlink'], 'Deletes a file of this workspace.', (input) => {
    const job = requireJob('kernel.files.unlink');
    unlinkAs(files, input.id, job.workspace.id, job.caller);
    return {};
  });
}
