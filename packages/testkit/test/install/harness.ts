import { mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  betterSqlite3Driver, createUlidGenerator, KernelRuntime, openKernelDatabase, readAppliedPreset, SecretStore, verifyEnabledSnapshots, type Connection, type LiveFrame, type LogRecord,
  type Sender,
} from '@kvman/kernel';
import { stageResultSchema, type Capabilities, type Json, type Problem, type ReplyPayload, type StageResult } from '@kvman/protocol';
import { ManualTimers, workspaceA, workspaceB } from '../hosts/harness.ts';
import { applyTestPreset, enableInPreset } from './fixture-presets.ts';
import { closedRegistry, noBuiltins } from './fixture-snapshots.ts';
import { temporary } from './packages.ts';

// Installing runs pnpm and the loader process for real.
export const installTests = { timeout: 90_000 } as const;

export type InstallFixture = {
  runtime: KernelRuntime;
  connection: Connection;
  home: string;
  timers: ManualTimers;
  live: LiveFrame[];
  logged: LogRecord[];
  // Enables (or re-grants) an installed extension in a workspace's applied preset through the test helper (ADR 0124).
  enable(workspaceId: string, name: string, grants: Capabilities): void;
  close(): Promise<void>;
};

export type InstallFixtureOptions = { registry?: string; builtin?: string; home?: string };

// A runtime on a real home folder, with workspaces A and B, the manual kernel clock (the fetch limit and the loader
// deadline fire only when a test moves it), and the path and proxies of this process for pnpm and git.
export async function openInstallFixture(options: InstallFixtureOptions = {}): Promise<InstallFixture> {
  const home = options.home ?? join(temporary('install'), 'home');
  mkdirSync(home, { recursive: true, mode: 0o700 });
  const databaseFile = join(home, 'kvman.db');
  const connection = openKernelDatabase(databaseFile, betterSqlite3Driver, createUlidGenerator(Date.now).next());
  for (const folder of [{ workspaceId: workspaceA, path: '/w/a', name: 'A' }, { workspaceId: workspaceB, path: '/w/b', name: 'B' }]) {
    if (readAppliedPreset({ connection }, folder.workspaceId) === undefined) applyTestPreset(connection, folder);
  }
  const timers = new ManualTimers();
  const live: LiveFrame[] = [];
  const logged: LogRecord[] = [];
  const ids = createUlidGenerator(Date.now);
  const runtime = new KernelRuntime({
    databaseFile, connection, secrets: SecretStore.load(home, ids.next()),
    install: { home, builtin: options.builtin ?? noBuiltins(home), registry: options.registry ?? closedRegistry, environment: process.env },
    ids, now: () => timers.time.value, timers, poolSize: 1, logger: { write: (record) => logged.push(record) },
    identity: { version: '0.0.0', instanceId: '0b5c7f2e-4a1d-4c3b-9e8f-1a2b3c4d5e6f', processStart: 'Thu Sep 25 10:00:00 2026', port: 4173, home, startedAt: timers.time.value },
    requestShutdown: () => undefined,
  });
  runtime.live.subscribe((frame) => live.push(frame));
  await runtime.install.clearStaging();
  await verifyEnabledSnapshots(runtime);
  await runtime.start();
  return {
    runtime, connection, home, timers, live, logged,
    enable: (workspaceId, name, grants) => {
      enableInPreset(connection, workspaceId, name, grants);
      runtime.registry.refresh();
    },
    close: async () => {
      await runtime.stop();
      connection.close();
    },
  };
}

let keys = 0;

export const person: Sender = { address: 'user:local' };

export function extensionActor(name: string): Sender {
  return { address: `ext:${name}`, extension: name };
}

export async function sendAs(fixture: InstallFixture, sender: Sender, type: string, payload: Json, workspaceId?: string): Promise<string> {
  keys += 1;
  const submission = await fixture.runtime.submitCommand({ sender, idempotencyKey: `install-${keys}`, type, payload, ...(workspaceId === undefined ? {} : { workspaceId }) });
  if (!submission.ok) throw new Error(`${type} was not admitted: ${submission.problem.code}`);
  return submission.id;
}

export async function command(fixture: InstallFixture, type: string, payload: Json, sender: Sender = person, workspaceId?: string): Promise<ReplyPayload> {
  return fixture.runtime.awaitReply(await sendAs(fixture, sender, type, payload, workspaceId));
}

export async function staged(fixture: InstallFixture, source: string): Promise<StageResult> {
  const reply = await command(fixture, 'kernel.extension.stage', { source });
  if (!reply.ok) throw new Error(`staging ${source} failed: ${reply.problem.code} ${reply.problem.detail ?? ''}`);
  return stageResultSchema.parse(reply.value);
}

export async function installed(fixture: InstallFixture, source: string): Promise<StageResult> {
  const stage = await staged(fixture, source);
  const reply = await command(fixture, 'kernel.extension.install', { confirmationToken: stage.confirmationToken });
  if (!reply.ok) throw new Error(`installing ${source} failed: ${reply.problem.code} ${reply.problem.detail ?? ''}`);
  return stage;
}

export function problemOf(reply: ReplyPayload): Problem {
  if (reply.ok) throw new Error('expected a problem');
  return reply.problem;
}

// The staging trees left in the home folder.
export function stagingTrees(fixture: InstallFixture): string[] {
  const folder = join(fixture.home, 'extensions', 'staging');
  mkdirSync(folder, { recursive: true });
  return readdirSync(folder);
}
