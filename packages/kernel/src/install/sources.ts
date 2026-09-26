import { cp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { builtinDigestsSchema, manifestSchema, sourceKindOf, type BuiltinDigests } from '@kvman/protocol';
import { x } from 'tar';
import type { SchedulerTimers } from '../scheduler/timers.ts';
import { toolEnvironment } from './bundled-tools.ts';
import { isUnreadable } from './file-errors.ts';
import { sourceInvalid } from './install-failure.ts';
import { snapshotFolder, type InstallPaths } from './install-paths.ts';
import { installTarball, packFolder, tarballPackageJson, type FetchTools } from './package-install.ts';
import { fetchGitTarball, fetchNpmTarball } from './remote-sources.ts';

// ADR 0118: fetching a source gets 5 minutes.
export const fetchLimitMs = 5 * 60_000;

export type SourceTools = {
  paths: InstallPaths;
  pnpm: () => string;
  registry: string;
  // The running kvman version: the integrity of a builtin: source (06 §6.1).
  kvmanVersion: string;
  environment: NodeJS.ProcessEnv;
  timers: SchedulerTimers;
  signal: AbortSignal;
};

// A staging folder: `tree` becomes the snapshot, `work` holds downloads, checkouts, and pnpm's store.
export type StagingFolders = { tree: string; work: string };

// What resolving produced in the tree: the package's name, its integrity, and for builtin: and local: the digest the
// tree must hash to, with the message of a mismatch.
export type ResolvedSource = { name: string; integrity?: string; expected?: { digest: string; mismatch: string } };

async function withinFetchLimit<T>(tools: SourceTools, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const stop = (): void => controller.abort(tools.signal.reason);
  tools.signal.addEventListener('abort', stop, { once: true });
  const limit = tools.timers.set(fetchLimitMs, () => controller.abort(sourceInvalid('fetching the source took longer than 5 minutes')));
  try {
    return await work(controller.signal);
  } finally {
    limit.cancel();
    tools.signal.removeEventListener('abort', stop);
  }
}

function fetchTools(tools: SourceTools, folders: StagingFolders, signal: AbortSignal): FetchTools {
  return { pnpm: tools.pnpm(), registry: tools.registry, environment: toolEnvironment(join(folders.work, 'home'), tools.environment), signal };
}

type Fetched = { tarball: string; integrity?: string };

async function installFetched(fetch: (fetchers: FetchTools) => Promise<Fetched>, folders: StagingFolders, tools: SourceTools, expectedName?: string): Promise<ResolvedSource> {
  return withinFetchLimit(tools, async (signal) => {
    const fetchers = fetchTools(tools, folders, signal);
    const { tarball, integrity } = await fetch(fetchers);
    const { name } = await tarballPackageJson(tarball);
    if (name === undefined) throw sourceInvalid('package.json has no name', { params: { field: 'name' } });
    if (expectedName !== undefined && name !== expectedName) throw sourceInvalid(`the package is named ${name}, not ${expectedName}`);
    await installTarball(tarball, folders.tree, folders.work, fetchers);
    return integrity === undefined ? { name } : { name, integrity };
  });
}

// The builtin folder's digest list; a folder without one ships no builtins.
export async function readBuiltinDigests(folder: string): Promise<BuiltinDigests> {
  try {
    return builtinDigestsSchema.parse(JSON.parse(await readFile(join(folder, 'digests.json'), 'utf8')));
  } catch (error) {
    if (isUnreadable(error)) return {};
    throw error;
  }
}

// 06 §6.2 step 1: builtin tarballs are only unpacked (no network, no pnpm) and checked against digests.json.
async function unpackBuiltin(name: string, folders: StagingFolders, tools: SourceTools): Promise<ResolvedSource> {
  const entry = (await readBuiltinDigests(tools.paths.builtin))[name];
  if (entry === undefined) throw sourceInvalid(`no builtin ${name}`);
  await x({ file: join(tools.paths.builtin, entry.file), cwd: folders.tree, strict: true });
  return { name, integrity: `builtin:${tools.kvmanVersion}`, expected: { digest: entry.digest, mismatch: `the builtin ${name} does not match digests.json` } };
}

// local:<digest>: an existing snapshot, copied as it is and checked against its digest.
async function copySnapshot(digest: string, folders: StagingFolders, tools: SourceTools): Promise<ResolvedSource> {
  const snapshot = snapshotFolder(tools.paths, digest);
  let manifestText: string;
  try {
    manifestText = await readFile(join(snapshot, 'manifest.json'), 'utf8');
  } catch (error) {
    if (isUnreadable(error)) throw sourceInvalid(`no snapshot ${digest} is installed`);
    throw error;
  }
  const { meta } = manifestSchema.parse(JSON.parse(manifestText));
  await cp(join(snapshot, 'node_modules'), join(folders.tree, 'node_modules'), { recursive: true, verbatimSymlinks: true });
  return { name: meta.name, expected: { digest, mismatch: `the snapshot ${digest} does not match its digest` } };
}

function splitAt(text: string, separator: string): [string, string] {
  const at = text.lastIndexOf(separator);
  return [text.slice(0, at), text.slice(at + 1)];
}

// 06 §6.2 step 1 for each source form (06 §6.1, ADR 0116). The source has passed its schema at admission.
export function resolveSource(source: string, folders: StagingFolders, tools: SourceTools): Promise<ResolvedSource> {
  const kind = sourceKindOf(source);
  const rest = source.slice(source.indexOf(':') + 1);
  if (kind === 'npm') {
    const [name, version] = splitAt(rest, '@');
    return installFetched((fetchers) => fetchNpmTarball(name, version, folders.work, fetchers), folders, tools, name);
  }
  if (kind === 'git') {
    const [url, commit] = splitAt(rest, '#');
    return installFetched((fetchers) => fetchGitTarball(url, commit, folders.work, fetchers), folders, tools);
  }
  if (kind === 'builtin') return unpackBuiltin(rest, folders, tools);
  if (kind === 'local') return copySnapshot(rest, folders, tools);
  return Promise.reject(sourceInvalid(`no dev version ${rest} is recorded`, { hint: 'dev versions come from kernel.dev.folder.stage and kernel.dev.build' }));
}

// The dev folder pipeline (ADR 0116): a developer's folder is packed and installed like a published package; the
// commands that record dev versions call it.
export function resolveFolder(folder: string, folders: StagingFolders, tools: SourceTools): Promise<ResolvedSource> {
  return installFetched(async (fetchers) => ({ tarball: await packFolder(folder, join(folders.work, 'pack'), fetchers) }), folders, tools);
}
