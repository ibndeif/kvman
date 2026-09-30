import { readFileSync } from 'node:fs';
import { z } from '@kvman/sdk';

// kvman's version: the kernel's own, which the root version sets (plan 01 §1.4).
export function kernelVersion(): string {
  const manifest: unknown = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  return z.object({ version: z.string() }).parse(manifest).version;
}
