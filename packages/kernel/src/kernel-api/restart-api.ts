import { kernelCommandSchemas } from '@kvman/sdk';
import type { KernelApiServices } from './kernel-api-services.ts';
import type { KernelRegistrations } from './kernel-registrations.ts';

// `kernel.restart` (plan 02 §2.12 and §2.14, ADR 0024, 2): the worker asks the main thread, which reports the request to
// whoever embeds the kernel and answers at once.
export function registerRestartApi(api: KernelRegistrations, services: KernelApiServices): void {
  api.command('kernel.restart', kernelCommandSchemas['kernel.restart'], 'Asks kvman to restart: it stops and starts again in the same process.', async () => {
    await services.request({ kind: 'restart' });
    return { restarting: true as const };
  }, { syncOnly: true });
}
