import { kernelCommandSchemas, kernelQuerySchemas, workspaceSchema } from '@kvman/sdk';
import { listWorkspaces } from '../workspaces/workspaces.ts';
import type { KernelApiServices } from './kernel-api-services.ts';
import type { KernelRegistrations } from './kernel-registrations.ts';

// `kernel.workspace.*` (plan 02 §2.6): the main thread opens and closes workspaces, since it queues their handler jobs
// and resumes their paused work.
export function registerWorkspaceApi(api: KernelRegistrations, services: KernelApiServices): void {
  api.command('kernel.workspace.open', kernelCommandSchemas['kernel.workspace.open'], 'Opens a folder as a workspace.', async (input) =>
    workspaceSchema.parse(await services.request({ kind: 'open-workspace', path: input.path })),
  );
  api.command('kernel.workspace.close', kernelCommandSchemas['kernel.workspace.close'], "Closes a workspace; its data stays for when it's opened again.", async (input) => {
    await services.request({ kind: 'close-workspace', workspaceId: input.workspaceId });
    return {};
  });
  api.query('kernel.workspace.list', kernelQuerySchemas['kernel.workspace.list'], 'Lists the open workspaces.', () => listWorkspaces(services.connection, services.homeFolder));
}
