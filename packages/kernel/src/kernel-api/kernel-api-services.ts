import type { Files } from '../files/files.ts';
import type { Registry } from '../jobs/registry.ts';
import type { SecretsFile } from '../secrets/secrets-file.ts';
import type { Settings } from '../settings/settings.ts';
import type { Connection } from '../storage/database.ts';
import type { WorkerExtension, WorkerRequest } from '../workers/protocol.ts';

// What the kernel's own handlers use in a worker; what only the main thread may do goes through `request`.
export type KernelApiServices = {
  connection: Connection;
  homeFolder: string;
  registry: Registry;
  settings: Settings;
  secrets: SecretsFile;
  files: Files;
  extensions: readonly WorkerExtension[];
  request: (request: WorkerRequest) => Promise<unknown>;
};
