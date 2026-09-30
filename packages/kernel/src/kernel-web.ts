import path from 'node:path';
import type { File, Job, Workspace } from '@kvman/sdk';
import { fileInWorkspace } from './files/file-access.ts';
import type { AdoptedFile, Files } from './files/files.ts';
import { readJob } from './jobs/job-rows.ts';
import type { KernelLogger } from './logging/logger.ts';
import type { ExtensionRun } from './run/extension-run.ts';
import type { Settings } from './settings/settings.ts';
import type { Connection } from './storage/database.ts';
import { homeWorkspaceId } from './workspaces/workspaces.ts';

// What the kernel's HTTP layer reads from a running kernel, beyond running jobs (plan 04).

export type CallTarget = { kind: 'command' | 'query'; public: boolean; maxInputBytes: number };

export type KernelWeb = {
  newJobId(): string;
  target(name: string): CallTarget | undefined;
  job(id: string): Job;
  workspace(id: string): Workspace;
  file(id: string, workspaceId: string): File;
  filePath(id: string): string;
  uploadPath(): string;
  adopt(file: AdoptedFile, from: string): File;
  // Each namespace whose extension declares `kvman.web`, with the folder's absolute path.
  webFolders(): ReadonlyMap<string, string>;
  // The namespace whose web folder is served at `/` (`kernel.web.home`).
  webHome(): string;
  logger: KernelLogger;
};

export type KernelWebServices = {
  connection: Connection;
  run: ExtensionRun;
  files: Files;
  settings: Settings;
  ids: () => string;
  workspace: (id: string) => Workspace;
  logger: KernelLogger;
};

export function createKernelWeb({ connection, run, files, settings, ids, workspace, logger }: KernelWebServices): KernelWeb {
  return {
    newJobId: ids,
    target: (name) => {
      const job = run.pool().summary.jobs.find((entry) => entry.name === name);
      return job === undefined ? undefined : { kind: job.kind, public: job.public, maxInputBytes: job.maxInputBytes };
    },
    job: (id) => readJob(connection, id),
    workspace,
    file: (id, workspaceId) => fileInWorkspace(files, id, workspaceId),
    filePath: (id) => files.path(id),
    uploadPath: () => files.temporaryPath(),
    adopt: (file, from) => files.adopt(file, from),
    webFolders: () =>
      new Map(
        run
          .extensions()
          .flatMap((extension) => (extension.manifest.kvman.web === undefined ? [] : [[extension.manifest.kvman.namespace, path.resolve(extension.folder, extension.manifest.kvman.web)] as const])),
      ),
    webHome: () => String(settings.resolve('kernel.web.home', homeWorkspaceId).value),
    logger,
  };
}
