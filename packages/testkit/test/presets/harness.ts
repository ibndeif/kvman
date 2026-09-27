import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { kernelVersion, packBuiltins } from '@kvman/kernel';
import { presetSchema, type Capabilities, type Json, type Preset, type ReplyPayload } from '@kvman/protocol';
import { workspaceA } from '../hosts/harness.ts';
import { closedRegistry, installFixture } from '../install/fixture-snapshots.ts';
import { command, installed, openInstallFixture, type InstallFixture } from '../install/harness.ts';
import { packPackage, temporary, writePackage } from '../install/packages.ts';
import { startRegistry, type LocalRegistry } from '../install/registries.ts';
import { eventsOf, grantsOf, rows } from '../workspaces/harness.ts';
import caller from '../reload/fixtures/extensions/others/caller.ts';
import steward from '../workspaces/fixtures/extensions/steward.ts';
import { clashPackage, firstPackage, pdfPackage, readerPackage, secondPackage, stashPackage } from './packages.ts';

// M2.8: the preset tests run with real worker threads and a real home folder.
export const presetTests = { timeout: 180_000 } as const;

const tarballs = new Map<string, string>();

async function tarballFor(key: string, pack: () => Promise<string>): Promise<string> {
  const cached = tarballs.get(key);
  if (cached !== undefined) return cached;
  const tarball = await pack();
  tarballs.set(key, tarball);
  return tarball;
}

function specKey(name: string, version: string): string {
  return `${name}@${version}`;
}

// M2.8: the local npm registry with Pdf ×3, Reader, Clash, and Stash ×2 published.
export async function startPresetRegistry(): Promise<LocalRegistry> {
  const registry = await startRegistry();
  const specs = [pdfPackage('0.9.0'), pdfPackage('1.0.0'), pdfPackage('1.1.0'), readerPackage(), clashPackage(), stashPackage('1.0.0'), stashPackage('2.0.0')];
  for (const spec of specs) {
    const version = spec.version ?? '1.0.0';
    const tarball = await tarballFor(specKey(spec.name, version), () => packPackage(writePackage(spec)));
    await registry.publish(tarball);
  }
  return registry;
}

// M2.8: sha512-<base64 of the tarball's SHA-512>, the registry's dist.integrity for the package.
export async function integrityOf(name: string, version: string): Promise<string> {
  const tarball = tarballs.get(specKey(name, version));
  if (tarball === undefined) throw new Error(`no tarball packed for ${name}@${version}`);
  return `sha512-${createHash('sha512').update(readFileSync(tarball)).digest('base64')}`;
}

let builtins: string | undefined;

// M2.8: First and Second packed the way pnpm build packs extensions/*.
export async function presetBuiltins(): Promise<string> {
  if (builtins !== undefined) return builtins;
  const folder = temporary('preset-builtin-extensions');
  writePackage(firstPackage(), join(folder, 'first'));
  writePackage(secondPackage(), join(folder, 'second'));
  const out = join(temporary('preset-builtin'), 'builtin');
  await packBuiltins(folder, out, { registry: closedRegistry, environment: process.env, kvmanVersion: '0.0.0' });
  builtins = out;
  return out;
}

const stewardFolder = fileURLToPath(new URL('../workspaces/fixtures/extensions/', import.meta.url));
const callerFolder = fileURLToPath(new URL('../reload/fixtures/extensions/others/', import.meta.url));

// M2.8: a runtime with the preset registry, builtins, Steward and Caller, and First and Second installed.
export async function openPresetFixture(registry: LocalRegistry, options: { home?: string } = {}): Promise<InstallFixture> {
  const fixture = await openInstallFixture({
    registry: registry.url, builtin: await presetBuiltins(), ...(options.home === undefined ? {} : { home: options.home }),
  });
  await installFixture(fixture.connection, fixture.home, { definition: steward, folder: stewardFolder, entry: 'steward.ts' });
  await installFixture(fixture.connection, fixture.home, { definition: caller, folder: callerFolder, entry: 'caller.ts' });
  fixture.runtime.registry.refresh();
  await installed(fixture, 'builtin:@acme/first');
  await installed(fixture, 'builtin:@acme/second');
  fixture.enable(workspaceA, '@acme/steward', grantsOf(fixture, '@acme/steward'));
  fixture.enable(workspaceA, '@acme/caller', grantsOf(fixture, '@acme/caller'));
  return fixture;
}

// M2.8: exactly what a Pdf version requests, sandboxed with nothing derived.
export function pdfGrants(version: '0.9.0' | '1.0.0' | '1.1.0'): Capabilities {
  if (version === '0.9.0') return { isolation: 'sandboxed', requested: [], derived: { subscribes: [], providesLlm: [] } };
  if (version === '1.0.0') return { isolation: 'sandboxed', requested: [{ name: 'files.read' }], derived: { subscribes: [], providesLlm: [] } };
  return { isolation: 'sandboxed', requested: [{ name: 'files.read' }, { name: 'llm' }], derived: { subscribes: [], providesLlm: [] } };
}

// M2.8: Preset P, a shareable preset enabling Pdf 1.0.0 with one page and two hidden ids.
export function presetP(integrity: string, overrides: Partial<Preset> = {}): Preset {
  return presetSchema.parse({
    presetVersion: 1,
    id: 'pdf-app',
    name: 'PDF App',
    revision: 1,
    app: { title: 'PDF App', home: '/help' },
    extensions: {
      '@acme/pdf': { source: 'npm:@acme/pdf@1.0.0', integrity, enabled: true, grants: pdfGrants('1.0.0') },
    },
    pages: [{ name: 'help', description: 'How to use the app.', route: '/help', title: 'Help', view: { type: 'markdown', source: 'Read me.' } }],
    hidden: ['settings.nav-general', 'pdf.debug'],
    ...overrides,
  });
}

// M2.8: the catalog rows as the tests read them.
export function catalogRows(fixture: InstallFixture): Array<Record<string, unknown>> {
  return rows(fixture, 'SELECT id, builtin, revision FROM presets ORDER BY id');
}

// M2.8: the kernel.preset.catalog.changed payloads in order.
export function catalogEvents(fixture: InstallFixture): unknown[] {
  return eventsOf(fixture, 'kernel.preset.catalog.changed').map((entry) => entry.payload);
}

// M2.8: kernel.preset.apply.stage as the person sends it; the reply (the preview or the problem).
export function stageApply(fixture: InstallFixture, workspaceId: string, request: { presetId: string } | { json: Json }): Promise<ReplyPayload> {
  return command(fixture, 'kernel.preset.apply.stage', { workspaceId, ...request });
}

// M2.8: kernel.preset.apply as the person sends it; the reply ({ revision } or the problem).
export function applyPreset(fixture: InstallFixture, confirmationToken: string): Promise<ReplyPayload> {
  return command(fixture, 'kernel.preset.apply', { confirmationToken });
}

// M2.8: kernel.preset.update as the person sends it; the reply ({ revision } or the problem).
export function updatePreset(fixture: InstallFixture, workspaceId: string, patch: Json, revision: number): Promise<ReplyPayload> {
  return command(fixture, 'kernel.preset.update', { workspaceId, patch, revision });
}

// M2.8: the extension_versions rows of one extension, to show a stage installed nothing.
export function versionRows(fixture: InstallFixture, name: string): Array<Record<string, unknown>> {
  return rows(fixture, 'SELECT name, digest FROM extension_versions WHERE name = ? ORDER BY digest', name);
}

// M2.8: a built-in preset file's entry for First or Second, with the running kernel's integrity.
export function builtinEntry(name: '@acme/first' | '@acme/second'): Preset['extensions'][string] {
  return {
    source: `builtin:${name}`, integrity: `builtin:${kernelVersion()}`, enabled: true,
    grants: { isolation: 'shared', requested: [], derived: { subscribes: [], providesLlm: [] } },
  };
}

// M2.8: a built-in preset file's JSON, valid against the preset schema.
export function builtinPreset(id: string, name: string, revision: number, extensions: Preset['extensions'] = {}): Preset {
  return presetSchema.parse({ presetVersion: 1, id, name, revision, app: { title: name, home: '/' }, extensions });
}

// M2.8: a builtin folder copied from the packed fixtures, so a test can add its own presets/ subfolder.
export async function copyPresetBuiltins(): Promise<string> {
  const target = join(temporary('preset-builtin-copy'), 'builtin');
  cpSync(await presetBuiltins(), target, { recursive: true });
  return target;
}

// M2.8: installs a dev: source through the dev folder pipeline (ADR 0116): stage the folder, place the staged
// tree, and commit the install through the pipeline like kernel.extension.install does.
export async function installDev(fixture: InstallFixture, folder: string, source: string): Promise<void> {
  const correlationId = '01JAZ3K4M5N6P7Q8R9S0T1V2W3';
  const staged = await fixture.runtime.install.stageFolder(folder, source, correlationId, new AbortController().signal);
  const version = await fixture.runtime.install.placeStaged(staged);
  const result = await fixture.runtime.pipeline.enqueue({
    origin: { kind: 'change', change: { kind: 'install', version }, correlationId }, writes: [], sends: [], publishes: [], replies: [],
  });
  if (!result.committed) throw new Error(`installing ${source} failed: ${result.problem.code} ${result.problem.detail ?? ''}`);
  fixture.runtime.registry.refresh();
}

// M2.8: the presets/ subfolder of a builtin folder, one <id>.json file per preset.
export function writeBuiltinPresets(builtin: string, presets: Readonly<Record<string, Preset>>): void {
  const folder = join(builtin, 'presets');
  mkdirSync(folder, { recursive: true });
  for (const [id, preset] of Object.entries(presets)) {
    writeFileSync(join(folder, `${id}.json`), `${JSON.stringify(preset, null, 2)}\n`);
  }
}
