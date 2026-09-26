import { join } from 'node:path';
import { createUlidGenerator, Kernel, packBuiltins, type EnabledExtensions } from '@kvman/kernel';
import type { Capabilities } from '@kvman/protocol';
import { ManualTimers } from '../hosts/harness.ts';
import { closedRegistry, noBuiltins } from '../install/fixture-snapshots.ts';
import { extensionSource, temporary, writePackage } from '../install/packages.ts';

export const builtinNames = ['@acme/first', '@acme/second'];

// Two builtin fixtures packed the way `pnpm build` packs extensions/* (ADR 0115).
export async function packedBuiltins(): Promise<string> {
  const extensions = temporary('builtin-extensions');
  for (const name of builtinNames) {
    const namespace = name.slice('@acme/'.length);
    writePackage({ name, files: { 'dist/extension.js': extensionSource(name, namespace) } }, join(extensions, namespace));
  }
  const builtin = join(temporary('builtin'), 'builtin');
  await packBuiltins(extensions, builtin, { registry: closedRegistry, environment: process.env });
  return builtin;
}

export const sharedGrants: Capabilities = { isolation: 'shared', requested: [], derived: { subscribes: [], providesLlm: [] } };

export type BootedHome = { kernel: Kernel; timers: ManualTimers; close(): Promise<void> };

// A daemon booted in this process on `home`, as 03 §3.9 boots it.
export async function bootHome(home: string, options: { enabled?: EnabledExtensions; builtin?: string; registry?: string } = {}): Promise<BootedHome> {
  const timers = new ManualTimers();
  const enabled = options.enabled ?? new Map();
  const names = new Set([...enabled.values()].flat());
  const kernel = await Kernel.boot({
    home, enabled, builtin: options.builtin ?? noBuiltins(home), npmRegistry: options.registry ?? closedRegistry, environment: process.env,
    grants: { capabilities: (extension) => (names.has(extension) ? sharedGrants : undefined) }, poolSize: 1, ids: createUlidGenerator(Date.now),
    now: () => timers.time.value, timers, openLogger: () => ({ write: () => undefined, close: () => undefined }), defaultLocale: () => 'en',
  });
  return {
    kernel, timers,
    close: async () => {
      const stopped = kernel.shutdown();
      timers.advance(10_000);
      await stopped;
    },
  };
}
