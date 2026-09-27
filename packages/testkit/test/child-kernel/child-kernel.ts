import { mkdirSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  createUlidGenerator, faultPointsOf, Kernel, kernelProblem, npmRegistryFrom, pinoKernelLogger, ProblemError, readBuiltinDigests, RotatingLogFile, systemTimers,
  type DaemonLogger,
} from '@kvman/kernel';
import type { Capabilities, DaemonStartReport, Problem } from '@kvman/protocol';
import type { ExtensionDefinition } from '@kvman/sdk';
import bench from './fixtures/extensions/bench.ts';
import ledger from './fixtures/extensions/ledger.ts';
import desk from '../workspaces/fixtures/extensions/desk.ts';
import probe from '../isolation/fixtures/extensions/probe.ts';
import keeper from '../blobs/fixtures/extensions/keeper.ts';
import runner from '../processes/fixtures/extensions/runner.ts';
import notes1 from '../reload/fixtures/extensions/notes/notes-1.ts';
import notes3 from '../reload/fixtures/extensions/notes/notes-3.ts';
import { applyTestPreset, emptyGrant } from '../install/fixture-presets.ts';
import { closedRegistry, installFixture, noBuiltins, prepareHome } from '../install/fixture-snapshots.ts';
import { fixtureFolder, workspaceFolderOf } from './workspace.ts';

// A kernel process with one fixture extension, booted as the daemon boots (ADR 0089): the fault harness kills it at
// a fault point (ADR 0100), and the benchmarks load it over HTTP (ADR 0104). It reports like the daemon (ADR 0087).

// `realWorkspace` gives the fixture workspace a real folder beside the home, and PATH to the processes it starts.
// `versions` are further installed versions; `storedVersion` is the extension's data version before boot; with
// `enabled: false` the workspace's preset does not enable it.
type FixtureVersion = { definition: ExtensionDefinition; file: string; version: string };
type Fixture = {
  name: string; definition: ExtensionDefinition; folder: string; file: string; poolSize: number; grant?: Capabilities; realWorkspace?: boolean;
  version?: string; versions?: FixtureVersion[]; storedVersion?: number; enabled?: boolean;
};

const childFixtures = fileURLToPath(new URL('./fixtures/extensions/', import.meta.url));
const notesFolder = fileURLToPath(new URL('../reload/fixtures/extensions/notes/', import.meta.url));
const sandboxed: Capabilities = { ...emptyGrant, isolation: 'sandboxed' };

// The desk of the workspace tests: a secret config field and a deferred command, for the M2.3 crash points. The probe of
// the isolation tests runs sandboxed, for the M2.4 host crash point. The keeper of the blob tests puts blobs, for the M2.5
// blob crash point and the boot that clears `once` trust. The runner of the process tests spawns processes, for the M2.6
// crash points, restarts, and shutdown.
const fixtures: Record<string, Fixture> = {
  ledger: { name: '@acme/ledger', definition: ledger, folder: childFixtures, file: 'ledger.ts', poolSize: 1 },
  bench: { name: '@acme/bench', definition: bench, folder: childFixtures, file: 'bench.ts', poolSize: Math.max(1, Math.min(4, availableParallelism() - 1)) },
  desk: { name: '@acme/desk', definition: desk, folder: fileURLToPath(new URL('../workspaces/fixtures/extensions/', import.meta.url)), file: 'desk.ts', poolSize: 1 },
  probe: {
    name: '@acme/probe', definition: probe, folder: fileURLToPath(new URL('../isolation/fixtures/extensions/', import.meta.url)), file: 'probe.ts', poolSize: 1,
    grant: { ...emptyGrant, isolation: 'sandboxed' },
  },
  keeper: { name: '@acme/keeper', definition: keeper, folder: fileURLToPath(new URL('../blobs/fixtures/extensions/', import.meta.url)), file: 'keeper.ts', poolSize: 1 },
  runner: {
    name: '@acme/runner', definition: runner, folder: fileURLToPath(new URL('../processes/fixtures/extensions/', import.meta.url)), file: 'runner.ts', poolSize: 1,
    grant: { ...emptyGrant, requested: [{ name: 'process' }] }, realWorkspace: true,
  },
  // The reload tests' Notes for the M2.7 crash points: 1.0.0 enabled with its data at version 1 and 3.0.0 installed,
  // or 3.0.0 alone enabled nowhere, or 1.0.0 enabled shared for the hot reloads of M2.7-H8.
  notes: {
    name: '@acme/notes', definition: notes1, folder: notesFolder, file: 'notes-1.ts', poolSize: 1, grant: sandboxed, storedVersion: 1,
    versions: [{ definition: notes3, file: 'notes-3.ts', version: '3.0.0' }],
  },
  'notes-enable': { name: '@acme/notes', definition: notes3, folder: notesFolder, file: 'notes-3.ts', version: '3.0.0', poolSize: 1, storedVersion: 1, enabled: false },
  'notes-shared': { name: '@acme/notes', definition: notes1, folder: notesFolder, file: 'notes-1.ts', poolSize: 1, grant: emptyGrant, storedVersion: 1 },
};

const { values } = parseArgs({ options: { home: { type: 'string' }, fixture: { type: 'string' }, builtin: { type: 'string' } }, strict: true });

const ids = createUlidGenerator(Date.now);

function report(result: DaemonStartReport): void {
  process.send?.(result);
}

function openLogger(home: string): DaemonLogger {
  const file = new RotatingLogFile({ folder: join(home, 'logs'), now: Date.now });
  const logger = pinoKernelLogger(file);
  return { write: (record) => logger.write(record), close: () => file.close() };
}

function problemOf(error: unknown): Problem {
  if (error instanceof ProblemError) return error.problem;
  return kernelProblem('INTERNAL', { correlationId: ids.next(), detail: error instanceof Error ? error.message : 'the fixture kernel did not start' });
}

// The Home workspace of a child kernel: beside its home folder, never the real ~/kvman (ADR 0127).
function homeWorkspaceOf(home: string): string {
  return join(dirname(home), 'kvman');
}

// ADR 0115, M2.2-H7: a first run on a fresh home that installs the builtin folder's tarballs, with the npm registry
// and proxies of its environment (the test points them at a closed port); then every builtin is enabled in the
// fixture workspace by the test helper (ADR 0124).
async function firstRun(home: string, builtin: string): Promise<void> {
  const names = Object.keys(await readBuiltinDigests(builtin));
  const kernel = await Kernel.boot({
    home, builtin, homeWorkspace: homeWorkspaceOf(home), npmRegistry: npmRegistryFrom(process.env), environment: process.env,
    poolSize: 1, ids, now: Date.now, timers: systemTimers, openLogger, defaultLocale: () => 'en',
  });
  applyTestPreset(kernel.connection, fixtureFolder, Object.fromEntries(names.map((name) => [name, emptyGrant])));
  kernel.runtime.registry.refresh();
  process.on('SIGTERM', () => void kernel.shutdown().then(() => process.disconnect()));
  report({ ok: true, port: kernel.identity.port });
}

// M2.8-E49/E50: workspaces A and B, each with an empty applied preset and no extension installed. The kernel
// boots with the npm registry and environment of its process (the test points them at its local registry).
const presetsWorkspaceB = { workspaceId: 'b'.repeat(64), path: '/w/b', name: 'B' } as const;

async function bootPresetsKernel(home: string): Promise<void> {
  await prepareHome(home, async (connection) => {
    applyTestPreset(connection, fixtureFolder, {});
    applyTestPreset(connection, presetsWorkspaceB, {});
  });
  const kernel = await Kernel.boot({
    home, builtin: noBuiltins(home), homeWorkspace: homeWorkspaceOf(home),
    npmRegistry: npmRegistryFrom(process.env), environment: process.env,
    poolSize: 1, ids, now: Date.now, timers: systemTimers, openLogger, defaultLocale: () => 'en',
    faults: faultPointsOf(process.env['KVMAN_FAULTS'], ids.next()),
  });
  process.on('SIGTERM', () => void kernel.shutdown().then(() => process.disconnect()));
  report({ ok: true, port: kernel.identity.port });
}

// M2.7-H8: asked over IPC, the kernel collects garbage (with --expose-gc) and reports its heap and running hosts.
function answerMemory(kernel: Kernel): void {
  process.on('message', (message) => {
    if (message !== 'memory') return;
    const collect: unknown = Reflect.get(globalThis, 'gc');
    if (typeof collect === 'function') collect();
    const hosts = kernel.runtime.hosts.hosts().map((entry) => ({ isolation: entry.isolation, host: entry.worker.host, threadId: entry.worker.thread.identity.threadId }));
    process.send?.({ heapUsed: process.memoryUsage().heapUsed, hosts });
  });
}

async function main(): Promise<void> {
  if (values.fixture === 'first-run' && values.home !== undefined && values.builtin !== undefined) {
    try {
      await firstRun(values.home, values.builtin);
    } catch (error) {
      process.exitCode = 1;
      report({ ok: false, problem: problemOf(error) });
      process.disconnect();
    }
    return;
  }
  if (values.fixture === 'presets' && values.home !== undefined) {
    try {
      await bootPresetsKernel(values.home);
    } catch (error) {
      process.exitCode = 1;
      report({ ok: false, problem: problemOf(error) });
      process.disconnect();
    }
    return;
  }
  const fixture = fixtures[values.fixture ?? ''];
  const home = values.home;
  if (fixture === undefined || home === undefined) throw new Error('usage: child-kernel.ts --home <folder> --fixture <fixture> [--builtin <folder>]');
  try {
    const workspace = fixture.realWorkspace === true ? { ...fixtureFolder, path: workspaceFolderOf(home) } : fixtureFolder;
    if (fixture.realWorkspace === true) mkdirSync(workspace.path, { recursive: true });
    await prepareHome(home, async (connection) => {
      await installFixture(connection, home, { definition: fixture.definition, folder: fixture.folder, entry: fixture.file, ...(fixture.version === undefined ? {} : { version: fixture.version }) });
      for (const { definition, file, version } of fixture.versions ?? []) await installFixture(connection, home, { definition, folder: fixture.folder, entry: file, version });
      if (fixture.storedVersion !== undefined) connection.prepare('INSERT INTO schema_versions (owner, version) VALUES (?, ?)').run(fixture.name, fixture.storedVersion);
      applyTestPreset(connection, workspace, fixture.enabled === false ? {} : { [fixture.name]: fixture.grant ?? emptyGrant });
    });
    const kernel = await Kernel.boot({
      home, builtin: noBuiltins(home), homeWorkspace: homeWorkspaceOf(home), npmRegistry: closedRegistry,
      environment: fixture.realWorkspace === true ? { PATH: process.env['PATH'] ?? '' } : {},
      poolSize: fixture.poolSize, ids, now: Date.now, timers: systemTimers, openLogger, defaultLocale: () => 'en',
      faults: faultPointsOf(process.env['KVMAN_FAULTS'], ids.next()),
    });
    process.on('SIGTERM', () => void kernel.shutdown().then(() => process.disconnect()));
    answerMemory(kernel);
    report({ ok: true, port: kernel.identity.port });
  } catch (error) {
    process.exitCode = 1;
    report({ ok: false, problem: problemOf(error) });
    process.disconnect();
  }
}

await main();
