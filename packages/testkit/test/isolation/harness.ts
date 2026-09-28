import { fileURLToPath } from 'node:url';
import { createUlidGenerator, EventHub, HttpAdapter, readAppliedPreset, writeAppliedPreset, type HostEntry } from '@kvman/kernel';
import { kernelPorts, type Capabilities, type Isolation } from '@kvman/protocol';
import type { ExtensionDefinition } from '@kvman/sdk';
import { applyTestPreset } from '../install/fixture-presets.ts';
import { installFixture } from '../install/fixture-snapshots.ts';
import { command, openInstallFixture, person, type InstallFixture } from '../install/harness.ts';
import { workspaceA } from '../hosts/harness.ts';
import { grantsOf } from '../workspaces/harness.ts';
import assistant from './fixtures/extensions/assistant.ts';
import bystander from './fixtures/extensions/bystander.ts';
import caller from './fixtures/extensions/caller.ts';
import intruder from './fixtures/extensions/intruder.ts';
import listener from './fixtures/extensions/listener.ts';
import probe from './fixtures/extensions/probe.ts';
import warden from './fixtures/extensions/warden.ts';

// Runtimes with worker threads, sandboxed processes, and a real home folder.
export const isolationTests = { timeout: 60_000 } as const;

export const workspaceC = 'c'.repeat(64);

const folder = fileURLToPath(new URL('./fixtures/extensions/', import.meta.url));

const fixtures: Array<{ definition: ExtensionDefinition; entry: string }> = [
  { definition: probe, entry: 'probe.ts' }, { definition: intruder, entry: 'intruder.ts' }, { definition: caller, entry: 'caller.ts' },
  { definition: assistant, entry: 'assistant.ts' }, { definition: listener, entry: 'listener.ts' }, { definition: bystander, entry: 'bystander.ts' },
  { definition: warden, entry: 'warden.ts' },
];

// Workspaces A, B, and C, each with an empty applied preset (ADR 0124), and every isolation fixture installed, none
// enabled.
export async function openIsolationFixture(): Promise<InstallFixture> {
  const fixture = await openInstallFixture();
  applyTestPreset(fixture.connection, { workspaceId: workspaceC, path: '/w/c', name: 'C' });
  for (const { definition, entry } of fixtures) await installFixture(fixture.connection, fixture.home, { definition, folder, entry });
  fixture.runtime.registry.refresh();
  return fixture;
}

// Enables an installed fixture with exactly its grants at the isolation given, through the preset helper.
export function enableAt(fixture: InstallFixture, workspaceId: string, name: string, isolation: Isolation): void {
  fixture.enable(workspaceId, name, grantsOf(fixture, name, isolation));
}

// A helper grant (ADR 0124) that bypasses the validity check, to prove the kernel's own enforcement.
export function enableWithGrant(fixture: InstallFixture, workspaceId: string, name: string, change: (grants: Capabilities) => Capabilities): void {
  fixture.enable(workspaceId, name, change(grantsOf(fixture, name, 'sandboxed')));
}

// Lists agent tool types in an enabled extension's `disable` of the workspace's applied preset (ADRs 0124, 0133).
export function disableTools(fixture: InstallFixture, workspaceId: string, name: string, types: string[]): void {
  const applied = readAppliedPreset({ connection: fixture.connection }, workspaceId);
  const entry = applied?.preset.extensions[name];
  if (applied === undefined || entry === undefined) throw new Error(`${name} is not in workspace ${workspaceId}'s preset`);
  const extensions = { ...applied.preset.extensions, [name]: { ...entry, disable: types } };
  writeAppliedPreset(fixture.connection, workspaceId, { ...applied.preset, revision: applied.revision + 1, extensions }, 1);
  fixture.runtime.registry.refresh();
}

// Documents of Probe's `items` collection, written a thousand per unit.
export async function seedItems(fixture: InstallFixture, group: string, prefix: string, count: number, size: number): Promise<void> {
  for (let from = 0; from < count; from += 1000) {
    const reply = await command(fixture, 'probe.seed', { group, prefix, from, count: Math.min(1000, count - from), size }, person, workspaceA);
    if (!reply.ok) throw new Error(`seeding failed: ${reply.problem.code}`);
  }
}

export type HostIdentity = { pid: number; threadId: number };

// The running host a handler reported as its own.
export function hostOf(fixture: InstallFixture, identity: HostIdentity): HostEntry | undefined {
  return fixture.runtime.hosts.hosts().find(({ worker }) => worker.thread.identity.pid === identity.pid && worker.thread.identity.threadId === identity.threadId);
}

// Signal 0 only asks whether the process still exists; ESRCH says it does not.
export function processExited(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ESRCH') return true;
    throw error;
  }
}

export type ServedFixture = { port: number; close(): Promise<void> };

// The runtime's HTTP adapter on a free kernel port, as the daemon serves it.
export async function serveHttp(fixture: InstallFixture): Promise<ServedFixture> {
  const ids = createUlidGenerator(Date.now);
  const adapter = new HttpAdapter({ ids, timers: fixture.timers, logger: { write: (record) => fixture.logged.push(record) } });
  const port = await adapter.bind(kernelPorts, ids.next());
  const hub = new EventHub({ connection: fixture.connection, files: fixture.runtime.files.files, pipeline: fixture.runtime.pipeline, live: fixture.runtime.live, timers: fixture.timers, version: '0.0.0', now: () => fixture.timers.time.value });
  adapter.open({ runtime: fixture.runtime, hub });
  return {
    port,
    close: async () => {
      hub.close();
      await adapter.close();
    },
  };
}
