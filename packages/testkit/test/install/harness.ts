import { mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  betterSqlite3Driver, createUlidGenerator, KernelRuntime, openKernelDatabase, verifyEnabledSnapshots, type Connection, type LiveFrame, type Sender,
} from '@kvman/kernel';
import { stageResultSchema, type Capabilities, type Json, type Problem, type ReplyPayload, type StageResult } from '@kvman/protocol';
import { ManualTimers, workspaceA, workspaceB } from '../hosts/harness.ts';
import { closedRegistry, noBuiltins } from './fixture-snapshots.ts';
import { temporary } from './packages.ts';

// Installing runs pnpm and the loader process for real.
export const installTests = { timeout: 90_000 } as const;

export type InstallFixture = {
  runtime: KernelRuntime;
  connection: Connection;
  home: string;
  timers: ManualTimers;
  grants: Record<string, Capabilities>;
  live: LiveFrame[];
  close(): Promise<void>;
};

export type InstallFixtureOptions = { registry?: string; builtin?: string; enabled?: ReadonlyArray<readonly [string, readonly string[]]>; home?: string };

export const sharedGrants: Capabilities = { isolation: 'shared', requested: [], derived: { subscribes: [], providesLlm: [] } };

// A runtime on a real home folder, with workspaces A and B, the manual kernel clock (the fetch limit and the loader
// deadline fire only when a test moves it), and the path and proxies of this process for pnpm and git.
export async function openInstallFixture(options: InstallFixtureOptions = {}): Promise<InstallFixture> {
  const home = options.home ?? join(temporary('install'), 'home');
  mkdirSync(home, { recursive: true, mode: 0o700 });
  const databaseFile = join(home, 'kvman.db');
  const connection = openKernelDatabase(databaseFile, betterSqlite3Driver, createUlidGenerator(Date.now).next());
  const insert = connection.prepare('INSERT OR IGNORE INTO workspaces (id, path, name, created_at) VALUES (?, ?, ?, ?)');
  insert.run(workspaceA, '/w/a', 'A', 1);
  insert.run(workspaceB, '/w/b', 'B', 1);
  const timers = new ManualTimers();
  const grants: Record<string, Capabilities> = {};
  const live: LiveFrame[] = [];
  const runtime = new KernelRuntime({
    databaseFile, connection, enabled: new Map(options.enabled ?? []), grants: { capabilities: (extension, workspaceId) => (workspaceId === undefined ? undefined : grants[extension]) },
    install: { home, builtin: options.builtin ?? noBuiltins(home), registry: options.registry ?? closedRegistry, environment: process.env },
    ids: createUlidGenerator(Date.now), now: () => timers.time.value, timers, poolSize: 1, logger: { write: () => undefined }, defaultLocale: () => 'en',
    identity: { version: '0.0.0', instanceId: '0b5c7f2e-4a1d-4c3b-9e8f-1a2b3c4d5e6f', processStart: 'Thu Sep 25 10:00:00 2026', port: 4173, home, startedAt: timers.time.value },
    requestShutdown: () => undefined,
  });
  runtime.live.subscribe((frame) => live.push(frame));
  await runtime.install.clearStaging();
  await verifyEnabledSnapshots(runtime);
  await runtime.start();
  return {
    runtime, connection, home, timers, grants, live,
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
