import type { Dirent } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { presetSchema, type BuiltinDigests, type Preset } from '@kvman/protocol';
import { c } from 'tar';
import { presetTextIssues } from '../i18n/owner-text.ts';
import { hostPlatform, pnpmExecutable, toolEnvironment } from './bundled-tools.ts';
import { isUnreadable } from './file-errors.ts';
import { readPackageJson } from './package-checks.ts';
import { installTarball, packFolder } from './package-install.ts';
import { buildFileList, snapshotDigest } from './snapshot-files.ts';

// ADR 0115: a builtin tarball's file name: the package name without "@", with "/" as "-".
export function builtinFileName(name: string): string {
  return `${name.replace(/^@/, '').replace('/', '-')}.tgz`;
}

export type PackingOptions = { registry: string; environment: NodeJS.ProcessEnv; presets?: string; kvmanVersion: string };

async function packOne(folder: string, out: string, options: PackingOptions): Promise<{ name: string; file: string; digest: string }> {
  const work = await mkdtemp(join(tmpdir(), 'kvman-pack-'));
  try {
    const tree = join(work, 'tree');
    await mkdir(tree);
    const tools = { pnpm: pnpmExecutable(hostPlatform()), registry: options.registry, environment: toolEnvironment(join(work, 'home'), options.environment), signal: new AbortController().signal };
    const tarball = await packFolder(folder, join(work, 'pack'), tools);
    await installTarball(tarball, tree, join(work, 'pnpm'), tools);
    const { name } = await readPackageJson(folder);
    if (name === undefined) throw new Error(`${folder}/package.json has no name`);
    const digest = snapshotDigest(await buildFileList(tree));
    const file = builtinFileName(name);
    await c({ gzip: true, portable: true, file: join(out, file), cwd: tree }, ['node_modules']);
    return { name, file, digest };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

// A repository without an extensions folder has no builtins yet.
async function extensionFolders(folder: string): Promise<Dirent[]> {
  try {
    return await readdir(folder, { withFileTypes: true });
  } catch (error) {
    if (isUnreadable(error)) return [];
    throw error;
  }
}

// 07 §7.4, ADR 0146 (`scripts/pack-builtins`): the presets folder's <id>.json files are checked against the
// preset schema and copied into out/presets/, with every builtin: entry's integrity set to the kvman version.
// A missing folder packs no presets and leaves out/ alone, so extension-only packs are unchanged.
async function packPresets(folder: string | undefined, out: string, kvmanVersion: string): Promise<void> {
  if (folder === undefined) return;
  let entries: Dirent[];
  try {
    entries = await readdir(folder, { withFileTypes: true });
  } catch (error) {
    if (isUnreadable(error)) return;
    throw error;
  }
  const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.json')).map((entry) => entry.name).sort();
  const presets = join(out, 'presets');
  await mkdir(presets, { recursive: true });
  for (const file of files) {
    const name = basename(file, '.json');
    const text = await readFile(join(folder, file), 'utf8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      if (error instanceof SyntaxError) throw new Error(`the built-in preset ${file} is not a valid preset`);
      throw error;
    }
    const checked = presetSchema.safeParse(parsed);
    if (!checked.success || presetTextIssues(checked.data).some((issue) => issue.severity !== 'warning')) {
      throw new Error(`the built-in preset ${file} is not a valid preset`);
    }
    if (checked.data.id !== name) {
      throw new Error(`the id of the built-in preset ${file} is not ${name}`);
    }
    const preset: Preset = {
      ...checked.data,
      extensions: Object.fromEntries(
        Object.entries(checked.data.extensions).map(([extension, entry]) => [
          extension,
          entry.source.startsWith('builtin:') ? { ...entry, integrity: `builtin:${kvmanVersion}` } : entry,
        ]),
      ),
    };
    await writeFile(join(presets, `${preset.id}.json`), `${JSON.stringify(preset, null, 2)}\n`);
  }
}

// 06 §6.9, ADR 0115 (`scripts/pack-builtins`): every package of the extensions folder becomes a self-contained
// tarball of the tree a staging install produces (the package and its production dependencies, hoisted), and
// digests.json maps each name to its tarball and the snapshot digest of that tree.
export async function packBuiltins(extensionsFolder: string, out: string, options: PackingOptions): Promise<BuiltinDigests> {
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  const digests: BuiltinDigests = {};
  for (const entry of (await extensionFolders(extensionsFolder)).filter((candidate) => candidate.isDirectory()).sort((left, right) => left.name.localeCompare(right.name))) {
    const packed = await packOne(join(extensionsFolder, entry.name), out, options);
    digests[packed.name] = { file: packed.file, digest: packed.digest };
  }
  await writeFile(join(out, 'digests.json'), `${JSON.stringify(digests, null, 2)}\n`);
  await packPresets(options.presets, out, options.kvmanVersion);
  return digests;
}
