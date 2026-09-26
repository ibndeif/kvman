import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { join } from 'node:path';
import { betterSqlite3Driver, createUlidGenerator, insertVersionRows, installPaths, openKernelDatabase, placeSnapshot, recordExtension, type Connection } from '@kvman/kernel';
import type { Manifest } from '@kvman/protocol';
import type { ExtensionDefinition } from '@kvman/sdk';

// ADR 0114: a fixture installed the way kernel.extension.install installs it, with setup recorded in this process
// instead of the loader: its folder's TypeScript becomes a JavaScript package under node_modules/<name>/, the tree
// becomes a snapshot with its manifest.json and files.json, and the extension's rows are written.
export type FixturePackage = {
  definition: ExtensionDefinition;
  folder: string;
  entry: string;
  version?: string;
  // Changes the recorded manifest before it is stored, e.g. to make it drift from what setup records.
  manifest?: (recorded: Manifest) => Manifest;
};

const correlationId = '01JAZ3K4M5N6P7Q8R9S0T1V2W3';

function javaScriptOf(source: string): string {
  return stripTypeScriptTypes(source, { mode: 'strip' }).replace(/(['"])(\.{1,2}\/[^'"]+)\.ts\1/g, '$1$2.js$1');
}

function writePackage(folder: string, target: string, name: string, version: string, entry: string): void {
  mkdirSync(target, { recursive: true });
  for (const file of readdirSync(folder).filter((candidate) => candidate.endsWith('.ts'))) {
    writeFileSync(join(target, file.replace(/\.ts$/, '.js')), javaScriptOf(readFileSync(join(folder, file), 'utf8')));
  }
  const packageJson = { name, version, description: 'A test fixture.', type: 'module', main: entry.replace(/\.ts$/, '.js'), peerDependencies: { '@kvman/sdk': '*' } };
  writeFileSync(join(target, 'package.json'), JSON.stringify(packageJson));
}

export async function installFixture(connection: Connection, home: string, fixture: FixturePackage): Promise<string> {
  const { name } = fixture.definition.meta;
  const version = fixture.version ?? '1.0.0';
  const tree = join(home, 'extensions', 'staging', randomUUID(), 'tree');
  writePackage(fixture.folder, join(tree, 'node_modules', name), name, version, fixture.entry);
  const recorded = recordExtension(fixture.definition, { packageName: name, version, correlationId }).manifest;
  const manifest = fixture.manifest === undefined ? recorded : fixture.manifest(recorded);
  const digest = await placeSnapshot(installPaths(home, join(home, 'builtin')), tree, manifest);
  if (digest === undefined) throw new Error(`the fixture ${name} could not be placed`);
  insertVersionRows(connection, { name, digest, source: `local:${digest}`, manifest, installedAt: 1_790_000_000_000 });
  return digest;
}

// ADR 0114: a home whose database already holds installed fixtures, so the boot is not a first run. A home that
// has a database keeps what it has.
export async function prepareHome(home: string, install: (connection: Connection, home: string) => Promise<void>): Promise<void> {
  if (existsSync(join(home, 'kvman.db'))) return;
  mkdirSync(home, { recursive: true, mode: 0o700 });
  const connection = openKernelDatabase(join(home, 'kvman.db'), betterSqlite3Driver, createUlidGenerator(Date.now).next());
  try {
    await install(connection, home);
  } finally {
    connection.close();
  }
}

// The builtin folder of a test home: empty, so a first run installs nothing (ADR 0115).
export function noBuiltins(home: string): string {
  return join(home, 'builtin');
}

// A registry nothing listens on: a test that does not install from npm never reaches the network.
export const closedRegistry = 'http://127.0.0.1:9/';
