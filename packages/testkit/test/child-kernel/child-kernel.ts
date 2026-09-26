import { availableParallelism } from 'node:os';
import { join } from 'node:path';
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
import { closedRegistry, installFixture, noBuiltins, prepareHome } from '../install/fixture-snapshots.ts';
import { fixtureWorkspace } from './workspace.ts';

// A kernel process with one fixture extension, booted as the daemon boots (ADR 0089): the fault harness kills it at
// a fault point (ADR 0100), and the benchmarks load it over HTTP (ADR 0104). It reports like the daemon (ADR 0087).

type Fixture = { name: string; definition: ExtensionDefinition; file: string; poolSize: number };

const fixtures: Record<string, Fixture> = {
  ledger: { name: '@acme/ledger', definition: ledger, file: 'ledger.ts', poolSize: 1 },
  bench: { name: '@acme/bench', definition: bench, file: 'bench.ts', poolSize: Math.max(1, Math.min(4, availableParallelism() - 1)) },
};

const grants: Capabilities = { isolation: 'shared', requested: [], derived: { subscribes: [], providesLlm: [] } };

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

// ADR 0115, M2.2-H7: a first run on a fresh home that installs the builtin folder's tarballs, with the npm registry
// and proxies of its environment (the test points them at a closed port), and every builtin enabled in the fixture
// workspace.
async function firstRun(home: string, builtin: string): Promise<void> {
  const names = Object.keys(await readBuiltinDigests(builtin));
  const kernel = await Kernel.boot({
    home, enabled: new Map([[fixtureWorkspace, names]]), builtin, npmRegistry: npmRegistryFrom(process.env), environment: process.env,
    grants: { capabilities: (extension) => (names.includes(extension) ? grants : undefined) },
    poolSize: 1, ids, now: Date.now, timers: systemTimers, openLogger, defaultLocale: () => 'en',
  });
  kernel.connection.prepare('INSERT OR IGNORE INTO workspaces (id, path, name, created_at) VALUES (?, ?, ?, ?)').run(fixtureWorkspace, '/w/a', 'A', 1);
  process.on('SIGTERM', () => void kernel.shutdown().then(() => process.disconnect()));
  report({ ok: true, port: kernel.identity.port });
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
  const fixture = fixtures[values.fixture ?? ''];
  const home = values.home;
  if (fixture === undefined || home === undefined) throw new Error('usage: child-kernel.ts --home <folder> --fixture ledger|bench|first-run [--builtin <folder>]');
  const folder = fileURLToPath(new URL('./fixtures/extensions/', import.meta.url));
  try {
    await prepareHome(home, async (connection) => {
      await installFixture(connection, home, { definition: fixture.definition, folder, entry: fixture.file });
    });
    const kernel = await Kernel.boot({
      home, enabled: new Map([[fixtureWorkspace, [fixture.name]]]), builtin: noBuiltins(home), npmRegistry: closedRegistry, environment: {},
      grants: { capabilities: (extension) => (extension === fixture.name ? grants : undefined) },
      poolSize: fixture.poolSize, ids, now: Date.now, timers: systemTimers, openLogger, defaultLocale: () => 'en',
      faults: faultPointsOf(process.env['KVMAN_FAULTS'], ids.next()),
    });
    kernel.connection.prepare('INSERT OR IGNORE INTO workspaces (id, path, name, created_at) VALUES (?, ?, ?, ?)').run(fixtureWorkspace, '/w/a', 'A', 1);
    process.on('SIGTERM', () => void kernel.shutdown().then(() => process.disconnect()));
    report({ ok: true, port: kernel.identity.port });
  } catch (error) {
    process.exitCode = 1;
    report({ ok: false, problem: problemOf(error) });
    process.disconnect();
  }
}

await main();
