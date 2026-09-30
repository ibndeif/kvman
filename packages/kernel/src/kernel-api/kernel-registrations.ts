import type { z } from '@kvman/sdk';
import { registerJob, type Owner, type Registry } from '../jobs/registry.ts';
import { kernelExtension } from '../settings/kernel-settings.ts';

// Registers the kernel's own commands and queries (plan 02 §2.12) in a worker, with the SDK's schemas
// (`kernelCommandSchemas`, `kernelQuerySchemas`), before the extensions load. All are public.

export const kernelOwner: Owner = { name: kernelExtension, namespace: 'kernel' };

// Lists can be long: they may use the largest output a registration can have (plan 02 §2.13).
const listOutputBytes = 32 * 1024 * 1024;

type Handle<Input extends z.ZodType, Output extends z.ZodType> = (input: z.output<Input>) => z.input<Output> | Promise<z.input<Output>>;

export type KernelRegistrations = {
  command<Input extends z.ZodType, Output extends z.ZodType>(
    name: string,
    schemas: { input: Input; output: Output },
    description: string,
    handle: Handle<Input, Output>,
    options?: { syncOnly: boolean },
  ): void;
  query<Input extends z.ZodType, Output extends z.ZodType>(name: string, schemas: { input: Input; output: Output }, description: string, handle: Handle<Input, Output>): void;
};

export function kernelRegistrations(registry: Registry): KernelRegistrations {
  return {
    command: (name, { input, output }, description, handle, options) =>
      registerJob(registry, kernelOwner, 'command', name, { description, input, output, handle, public: true }, options?.syncOnly ?? false),
    query: (name, { input, output }, description, handle) =>
      registerJob(registry, kernelOwner, 'query', name, { description, input, output, handle, public: true, maxOutputBytes: listOutputBytes }),
  };
}
