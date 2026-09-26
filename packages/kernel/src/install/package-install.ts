import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { packageJsonSchema, type PackageJson } from '@kvman/protocol';
import { t } from 'tar';
import { sourceInvalid } from './install-failure.ts';
import { runTool, ToolFailed } from './tool-runs.ts';

// What a fetch needs: the bundled pnpm, the npm registry, the tools' environment, and the signal that stops it.
export type FetchTools = { pnpm: string; registry: string; environment: NodeJS.ProcessEnv; signal: AbortSignal };

function lastLine(text: string): string {
  return text.trim().split('\n').at(-1) ?? '';
}

// The package.json inside a package tarball (its first folder, `package/` for npm and pnpm tarballs).
export async function tarballPackageJson(tarball: string): Promise<PackageJson> {
  let text: string | undefined;
  await t({
    file: tarball,
    onReadEntry: (entry) => {
      if (!/^[^/]+\/package\.json$/.test(entry.path)) {
        entry.resume();
        return;
      }
      const chunks: Buffer[] = [];
      entry.on('data', (chunk: Buffer) => chunks.push(chunk));
      entry.on('end', () => { text ??= Buffer.concat(chunks).toString('utf8'); });
    },
  });
  if (text === undefined) throw sourceInvalid('the package has no package.json');
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw sourceInvalid('package.json is not valid JSON');
  }
  const parsed = packageJsonSchema.safeParse(json);
  if (!parsed.success) throw sourceInvalid('package.json is not valid');
  return parsed.data;
}

// ADR 0116: a folder (a git checkout or a developer's folder) becomes a package tarball the way npm publishes it,
// with every lifecycle script disabled.
export async function packFolder(folder: string, destination: string, tools: FetchTools): Promise<string> {
  await mkdir(destination, { recursive: true });
  try {
    const env = { ...tools.environment, pnpm_config_ignore_scripts: 'true' };
    await runTool({ command: tools.pnpm, args: ['pack', '--pack-destination', destination], cwd: folder, env, signal: tools.signal });
  } catch (error) {
    if (error instanceof ToolFailed) throw sourceInvalid(`pnpm cannot pack the package: ${lastLine(error.stderr)}`);
    throw error;
  }
  const [tarball] = (await readdir(destination)).filter((name) => name.endsWith('.tgz'));
  if (tarball === undefined) throw sourceInvalid('pnpm pack produced no tarball');
  return join(destination, tarball);
}

const bookkeeping = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'node_modules/.pnpm', 'node_modules/.modules.yaml', 'node_modules/.pnpm-workspace-state-v1.json'];

async function removeBinFolders(folder: string): Promise<void> {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = join(folder, entry.name);
    if (entry.name === '.bin') await rm(path, { recursive: true, force: true });
    else await removeBinFolders(path);
  }
}

// 06 §6.2 step 1, ADR 0116: pnpm installs the tarball and its production dependencies into the staging tree with
// scripts disabled, hoisted and copied (so the snapshot owns every byte), from KVMAN_NPM_REGISTRY. pnpm 12 reads these
// settings from its environment (pnpm_config_*). Its store, cache, and bookkeeping are then removed, leaving
// node_modules/<name>/ and the hoisted dependencies.
export async function installTarball(tarball: string, tree: string, work: string, tools: FetchTools): Promise<void> {
  await writeFile(join(tree, 'package.json'), '{"private":true}\n');
  const env = {
    ...tools.environment, pnpm_config_ignore_scripts: 'true', pnpm_config_node_linker: 'hoisted', pnpm_config_auto_install_peers: 'false',
    pnpm_config_package_import_method: 'copy', pnpm_config_store_dir: join(work, 'store'), pnpm_config_cache_dir: join(work, 'cache'), pnpm_config_registry: tools.registry,
  };
  try {
    await runTool({ command: tools.pnpm, args: ['add', tarball, '--ignore-scripts', '--prod', '--ignore-workspace'], cwd: tree, env, signal: tools.signal });
  } catch (error) {
    if (error instanceof ToolFailed) throw sourceInvalid(`pnpm cannot install the package: ${lastLine(error.stderr)}`);
    throw error;
  }
  for (const path of bookkeeping) await rm(join(tree, path), { recursive: true, force: true });
  await removeBinFolders(join(tree, 'node_modules'));
}
