import { healthSchema, kernelQuerySchemas } from '@kvman/sdk';
import { listProcesses } from '../processes/process-rows.ts';
import type { KernelApiServices } from './kernel-api-services.ts';
import type { KernelRegistrations } from './kernel-registrations.ts';

// `kernel.health.get` (ADR 0009, 29), which the main thread answers since it knows the run, and `kernel.processes.list`.
export function registerHealthApi(api: KernelRegistrations, services: KernelApiServices): void {
  api.query('kernel.health.get', kernelQuerySchemas['kernel.health.get'], 'Describes the running kvman.', async () =>
    healthSchema.parse(await services.request({ kind: 'health' })),
  );
  api.query('kernel.processes.list', kernelQuerySchemas['kernel.processes.list'], 'Lists the running long-lived processes.', () => listProcesses(services.connection));
}
