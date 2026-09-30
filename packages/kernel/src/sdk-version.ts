import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { z } from '@kvman/sdk';

// The version of the kernel's own `@kvman/sdk`, which every extension's peer range must include (plan 02 §2.9).
export function kernelSdkVersion(): string {
  const manifestPath = createRequire(import.meta.url).resolve('@kvman/sdk/package.json');
  const manifest: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'));
  return z.object({ version: z.string() }).parse(manifest).version;
}
