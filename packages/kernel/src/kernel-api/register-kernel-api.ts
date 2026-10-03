import type { Registry } from '../jobs/registry.ts';
import { registerExtensionsApi } from './extensions-api.ts';
import { registerFolderApi } from './folder-api.ts';
import { registerHealthApi } from './health-api.ts';
import { registerJobsFilesApi } from './jobs-files-api.ts';
import type { KernelApiServices } from './kernel-api-services.ts';
import { kernelRegistrations } from './kernel-registrations.ts';
import { registerPresetApi } from './preset-api.ts';
import { registerSecretsApi } from './secrets-api.ts';
import { registerSettingsApi } from './settings-api.ts';
import { registerWorkspaceApi } from './workspace-api.ts';

// Every `kernel.*` command and query (plan 02 §2.12), registered in each worker before the extensions load.
export function registerKernelApi(registry: Registry, services: KernelApiServices): void {
  const api = kernelRegistrations(registry);
  registerWorkspaceApi(api, services);
  registerFolderApi(api, services);
  registerSettingsApi(api, services);
  registerSecretsApi(api, services);
  registerJobsFilesApi(api, services);
  registerExtensionsApi(api, services);
  registerPresetApi(api, services);
  registerHealthApi(api, services);
}
