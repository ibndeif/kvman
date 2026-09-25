import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  createUlidGenerator, faultPointsOf, Kernel, kernelProblem, pinoKernelLogger, ProblemError, recordExtension, RotatingLogFile, systemTimers,
  type DaemonLogger,
} from '@kvman/kernel';
import type { Capabilities, DaemonStartReport, Problem } from '@kvman/protocol';
import type { ExtensionDefinition } from '@kvman/sdk';
import bench from './fixtures/extensions/bench.ts';
import ledger from './fixtures/extensions/ledger.ts';
import { fixtureWorkspace } from './workspace.ts';

// A kernel process with one fixture extension, booted as the daemon boots (ADR 0089): the fault harness kills it at
// a fault point (ADR 0100), and the benchmarks load it over HTTP (ADR 0104). It reports like the daemon (ADR 0087).

type Fixture = { name: string; definition: ExtensionDefinition; file: string; poolSize: number };

const fixtures: Record<string, Fixture> = {
  ledger: { name: '@acme/ledger', definition: ledger, file: 'ledger.ts', poolSize: 1 },
  bench: { name: '@acme/bench', definition: bench, file: 'bench.ts', poolSize: Math.max(1, Math.min(4, availableParallelism() - 1)) },
};

const grants: Capabilities = { isolation: 'shared', requested: [], derived: { subscribes: [], providesLlm: [] } };

const { values } = parseArgs({ options: { home: { type: 'string' }, fixture: { type: 'string' } }, strict: true });

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

async function main(): Promise<void> {
  const fixture = fixtures[values.fixture ?? ''];
  const home = values.home;
  if (fixture === undefined || home === undefined) throw new Error('usage: child-kernel.ts --home <folder> --fixture ledger|bench');
  const { manifest } = recordExtension(fixture.definition, { version: '1.0.0', correlationId: ids.next() });
  const entry = fileURLToPath(new URL(`./fixtures/extensions/${fixture.file}`, import.meta.url));
  try {
    const kernel = await Kernel.boot({
      home, extensions: { extensions: [{ manifest, quarantined: false }], enabled: new Map([[fixtureWorkspace, [fixture.name]]]) },
      grants: { capabilities: (extension) => (extension === fixture.name ? grants : undefined) }, modules: { entry: () => entry },
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
