import { dirname, join } from 'node:path';
import { createUlidGenerator, Kernel, packBuiltins } from '@kvman/kernel';
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

export type BootedHome = { kernel: Kernel; timers: ManualTimers; close(): Promise<void> };

// The Home workspace a test daemon's first run opens: beside its home folder, never the real ~/kvman (ADR 0127).
export function testHomeWorkspace(home: string): string {
  return join(dirname(home), 'kvman');
}

// A daemon booted in this process on `home`, as 03 §3.9 boots it; what it enables is in its applied presets.
export async function bootHome(home: string, options: { builtin?: string; registry?: string; homeWorkspace?: string } = {}): Promise<BootedHome> {
  const timers = new ManualTimers();
  const kernel = await Kernel.boot({
    home, builtin: options.builtin ?? noBuiltins(home), homeWorkspace: options.homeWorkspace ?? testHomeWorkspace(home), npmRegistry: options.registry ?? closedRegistry,
    environment: process.env, poolSize: 1, ids: createUlidGenerator(Date.now),
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
