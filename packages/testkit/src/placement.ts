import { randomUUID } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { insertVersionRows, installPaths, placeSnapshot, ProblemError, recordExtension, type Connection } from '@kvman/kernel';
import type { Issue, Manifest } from '@kvman/protocol';
import type { ExtensionDefinition } from '@kvman/sdk';
import { TestkitError } from './testkit-errors.ts';

// One extension's package as the testkit installs it: its definition, recorded here, and its files by path.
export type TestPackage = { definition: ExtensionDefinition; files: ReadonlyMap<string, string>; entry: string };

export type PlaceOptions = { connection: Connection; home: string; builtin: boolean; kvmanVersion: string };

export type Placed = { name: string; manifest: Manifest; warnings: Issue[] };

const correlationId = '01JAZ3K4M5N6P7Q8R9S0T1V2W3';
const version = '1.0.0';

function javaScriptOf(source: string): string {
  return stripTypeScriptTypes(source, { mode: 'strip' }).replace(/(['"])(\.{1,2}\/[^'"]+)\.ts\1/g, '$1$2.js$1');
}

function listFiles(folder: string, root: string, found: Map<string, string>): void {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const path = join(folder, entry.name);
    if (entry.isDirectory()) listFiles(path, root, found);
    else if (entry.isFile()) found.set(relative(root, path), readFileSync(path, 'utf8'));
  }
}

// ADR 0165: the entry's folder and everything under it, as the extension's files.
export function folderFiles(folder: string): Map<string, string> {
  const found = new Map<string, string>();
  listFiles(folder, folder, found);
  return found;
}

function writePackage(target: string, name: string, pkg: TestPackage): void {
  for (const [path, content] of pkg.files) {
    const typescript = path.endsWith('.ts');
    const file = join(target, typescript ? path.replace(/\.ts$/, '.js') : path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, typescript ? javaScriptOf(content) : content);
  }
  const main = pkg.entry.replace(/\.ts$/, '.js');
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name, version, description: 'An extension under test.', type: 'module', main, peerDependencies: { '@kvman/sdk': '*' } }));
}

function recorded(definition: ExtensionDefinition): { manifest: Manifest; warnings: Issue[] } {
  try {
    const recording = recordExtension(definition, { packageName: definition.meta.name, version, correlationId });
    return { manifest: recording.manifest, warnings: recording.warnings };
  } catch (error) {
    if (!(error instanceof ProblemError)) throw error;
    const issues = (error.problem.issues ?? []).map((issue) => `\n  ${issue.path}: ${issue.message}`).join('');
    throw new TestkitError(`${definition.meta.name} does not record: ${error.problem.code} ${error.problem.detail ?? ''}${issues}`);
  }
}

// ADR 0165: recorded in the test process (setup runs twice there), placed as a snapshot the way an install places
// one, and written with its version rows. A builtin source runs shared like the core extensions (05 §5.7).
export async function placeExtension(pkg: TestPackage, options: PlaceOptions): Promise<Placed> {
  const { name } = pkg.definition.meta;
  const { manifest, warnings } = recorded(pkg.definition);
  const tree = join(options.home, 'extensions', 'staging', randomUUID(), 'tree');
  writePackage(join(tree, 'node_modules', name), name, pkg);
  const digest = await placeSnapshot(installPaths(options.home, join(options.home, 'builtin')), tree, manifest);
  if (digest === undefined) throw new TestkitError(`${name} could not be placed as a snapshot`);
  insertVersionRows(options.connection, {
    name, digest, manifest, installedAt: Date.now(),
    ...(options.builtin ? { source: `builtin:${name}`, integrity: `builtin:${options.kvmanVersion}` } : { source: `local:${digest}` }),
  });
  return { name, manifest, warnings };
}
