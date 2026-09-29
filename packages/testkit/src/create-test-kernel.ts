import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { derivedCapabilities } from '@kvman/kernel';
import { applyPreviewSchema, workspaceOpenResultSchema, type Issue } from '@kvman/protocol';
import type { ExtensionDefinition } from '@kvman/sdk';
import { CrashPoints } from './crash-points.ts';
import { driverName } from './driver-extension.ts';
import type { FakeProcess } from './fake-processes.ts';
import type { FakeProvider } from './fake-provider.ts';
import { driverPackage, fakeProviderPackage } from './generated-packages.ts';
import { command, person } from './kernel-calls.ts';
import { folderFiles, placeExtension, type Placed, type TestPackage } from './placement.ts';
import { TestKernel } from './test-kernel.ts';
import { kvmanVersion, openRuntime, stopRuntime, type OpenRuntime, type RuntimeSettings } from './test-runtime.ts';
import { TestkitError } from './testkit-errors.ts';

/** What `createTestKernel` takes (ADR 0165). */
export type TestKernelOptions = {
  /** Each extension's entry module, and fakes such as `fakeProvider(...)`. */
  extensions: Array<URL | FakeProvider>;
  /** The folder opened as the workspace; a new temporary folder when absent. */
  workspace?: string;
  /** The isolation of the extensions under test; else `KVMAN_TESTKIT_ISOLATION`, else `shared`. */
  isolation?: 'shared' | 'sandboxed';
  /** Commands whose spawns run a scripted stand-in (ADR 0166). */
  processes?: Record<string, FakeProcess>;
};

type Loaded = { pkg: TestPackage; underTest: boolean };

// The smallest preset a workspace can apply: its own home page and no extension; enabling adds them (ADR 0165).
const testPreset = {
  presetVersion: 1, id: 'testkit', name: 'Testkit', revision: 1, app: { title: 'Testkit', home: '/' }, extensions: {},
  pages: [{ name: 'home', description: 'The home page of the test workspace.', route: '/', title: 'Testkit', view: { type: 'text', text: 'Testkit' } }],
};

function isolationOf(options: TestKernelOptions): 'shared' | 'sandboxed' {
  if (options.isolation !== undefined) return options.isolation;
  const setting = process.env['KVMAN_TESTKIT_ISOLATION'];
  if (setting === undefined || setting === '' || setting === 'shared') return 'shared';
  if (setting === 'sandboxed') return 'sandboxed';
  throw new TestkitError(`KVMAN_TESTKIT_ISOLATION is "${setting}"; it must be shared or sandboxed`);
}

function isExtensionDefinition(value: unknown): value is ExtensionDefinition {
  return typeof value === 'object' && value !== null && 'meta' in value && 'setup' in value && typeof value.setup === 'function';
}

async function loaded(extension: URL | FakeProvider): Promise<Loaded> {
  if (!(extension instanceof URL)) return { pkg: fakeProviderPackage(extension.options), underTest: false };
  const entry = fileURLToPath(extension);
  const imported: unknown = await import(extension.href);
  const definition = typeof imported === 'object' && imported !== null && 'default' in imported ? imported.default : undefined;
  if (!isExtensionDefinition(definition)) throw new TestkitError(`EXT_MANIFEST_INVALID: ${entry} does not export defineExtension(...) as its default`);
  return { pkg: { definition, files: folderFiles(dirname(entry)), entry: basename(entry) }, underTest: true };
}

function warningText(name: string, issue: Issue): string {
  return `${name} ${issue.path}: ${issue.message}`;
}

// ADR 0166: a key missing from any shipped catalog fails; literal text and placeholder descriptions are printed.
function checkCatalogs(placed: readonly Placed[]): void {
  const missing = placed.flatMap(({ name, warnings }) => warnings.filter((issue) => issue.code === 'TRANSLATION_MISSING').map((issue) => warningText(name, issue)));
  if (missing.length > 0) throw new TestkitError(`translation keys missing from a shipped catalog:\n  ${missing.join('\n  ')}`);
  for (const { name, warnings } of placed) {
    for (const issue of warnings.filter((warning) => warning.code === 'LITERAL_TEXT' || warning.code === 'PLACEHOLDER_DESCRIPTION')) console.warn(`kvman testkit: ${warningText(name, issue)}`);
  }
}

async function openWorkspace(open: OpenRuntime, path: string): Promise<string> {
  const { runtime } = open;
  const { workspaceId } = workspaceOpenResultSchema.parse(await command(runtime, person, 'kernel.workspace.open', { path }, undefined));
  const preview = applyPreviewSchema.parse(await command(runtime, person, 'kernel.preset.apply.stage', { workspaceId, json: testPreset }, workspaceId));
  await command(runtime, person, 'kernel.preset.apply', { confirmationToken: preview.confirmationToken }, workspaceId);
  return workspaceId;
}

async function prepared(open: OpenRuntime, settings: RuntimeSettings, packages: readonly Loaded[], isolation: 'shared' | 'sandboxed', workspace: string): Promise<string> {
  const placing = { connection: open.connection, home: settings.home, builtin: isolation === 'shared', kvmanVersion };
  const types = [...new Set(packages.map(({ pkg }) => `${pkg.definition.meta.namespace}.*`))].sort();
  const placed: Placed[] = [];
  for (const { pkg } of [...packages, { pkg: driverPackage(types) }]) placed.push(await placeExtension(pkg, placing));
  checkCatalogs(placed.filter((entry) => packages.some(({ pkg, underTest }) => underTest && pkg.definition.meta.name === entry.name)));
  open.runtime.registry.refresh();
  const workspaceId = await openWorkspace(open, workspace);
  for (const { name, manifest } of placed) {
    await command(open.runtime, person, 'kernel.extension.enable', { workspaceId, name, grants: { isolation, ...derivedCapabilities(manifest) } }, workspaceId);
  }
  return workspaceId;
}

/** Starts the real kernel on a temporary home, installs and enables the extensions in one workspace (05 §5.10). */
export async function createTestKernel(options: TestKernelOptions): Promise<TestKernel> {
  const isolation = isolationOf(options);
  const packages = await Promise.all(options.extensions.map(loaded));
  if (packages.some(({ pkg }) => pkg.definition.meta.name === driverName)) throw new TestkitError(`${driverName} is the testkit's own extension`);
  const home = mkdtempSync(join(tmpdir(), 'kvman-testkit-'));
  const temporary = [home];
  const workspace = options.workspace ?? mkdtempSync(join(tmpdir(), 'kvman-testkit-workspace-'));
  if (options.workspace === undefined) temporary.push(workspace);
  const crashes = new CrashPoints();
  const settings: RuntimeSettings = { home, crashes, processes: options.processes ?? {}, logged: [] };
  const open = await openRuntime(settings);
  try {
    const workspaceId = await prepared(open, settings, packages, isolation, workspace);
    return new TestKernel({ open, settings, crashes, workspaceId, temporary });
  } catch (error) {
    await stopRuntime(open);
    for (const folder of temporary) rmSync(folder, { recursive: true, force: true });
    throw error;
  }
}
