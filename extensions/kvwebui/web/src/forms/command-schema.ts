import { kernelCommandSchemas, z } from '@kvman/sdk';
import type { ExtensionInfo } from '../api/kernel.ts';

// A command's input JSON Schema, for its form (plan 06 §6.4): an extension's from `kernel.extensions.list`, and the
// kernel's own (which isn't listed) from the SDK's schemas, converted as the kernel converts inputs (plan 02 §2.12).
export function commandInputSchema(extensions: readonly ExtensionInfo[], command: string): unknown {
  if (Object.hasOwn(kernelCommandSchemas, command)) {
    const schemas = kernelCommandSchemas[command as keyof typeof kernelCommandSchemas];
    return z.toJSONSchema(schemas.input, { io: 'input', unrepresentable: 'any' });
  }
  return extensions.flatMap((extension) => extension.commands).find((candidate) => candidate.name === command)?.input;
}
