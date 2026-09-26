import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { npmVersionMetadataSchema } from '@kvman/protocol';
import { gitCommands } from './bundled-tools.ts';
import { sourceInvalid } from './install-failure.ts';
import { packFolder, type FetchTools } from './package-install.ts';
import { runTool, ToolFailed } from './tool-runs.ts';

export type FetchedTarball = { tarball: string; integrity: string };

// A fetch refused by the network, unless the signal (the time limit, a shutdown) stopped it: then its reason.
async function fetched(url: string | URL, tools: FetchTools, unreachable: string): Promise<Response> {
  try {
    return await fetch(url, { signal: tools.signal });
  } catch (error) {
    if (tools.signal.aborted) throw tools.signal.reason;
    if (error instanceof TypeError) throw sourceInvalid(unreachable);
    throw error;
  }
}

function metadataUrl(registry: string, name: string, version: string): URL {
  const base = registry.endsWith('/') ? registry : `${registry}/`;
  return new URL(`${name.replace('/', '%2f')}/${version}`, base);
}

// ADR 0116: the version's metadata, then its tarball, checked against the registry's dist.integrity (the integrity
// that pins it, 06 §6.1).
export async function fetchNpmTarball(name: string, version: string, work: string, tools: FetchTools): Promise<FetchedTarball> {
  const response = await fetched(metadataUrl(tools.registry, name, version), tools, `the registry ${tools.registry} cannot be reached`);
  if (response.status === 404) throw sourceInvalid(`npm has no version ${version} of ${name}`);
  if (!response.ok) throw sourceInvalid(`the registry answered ${response.status} for ${name}@${version}`);
  const metadata = npmVersionMetadataSchema.safeParse(await response.json());
  if (!metadata.success) throw sourceInvalid(`the registry's metadata of ${name}@${version} is not valid`);
  const { tarball, integrity } = metadata.data.dist;
  const download = await fetched(tarball, tools, `the tarball of ${name}@${version} cannot be downloaded`);
  if (!download.ok) throw sourceInvalid(`the tarball of ${name}@${version} cannot be downloaded (${download.status})`);
  const bytes = Buffer.from(await download.arrayBuffer());
  if (`sha512-${createHash('sha512').update(bytes).digest('base64')}` !== integrity) {
    throw sourceInvalid(`the tarball of ${name}@${version} does not match its integrity`, { params: { integrity } });
  }
  await mkdir(work, { recursive: true });
  const file = join(work, 'package.tgz');
  await writeFile(file, bytes);
  return { tarball: file, integrity };
}

function lastLine(text: string): string {
  return text.trim().split('\n').at(-1) ?? '';
}

// ADR 0116: the kernel runs git itself (06 §6.1's flags and `--`), checks out exactly the commit, and packs the
// checkout like a published package.
export async function fetchGitTarball(url: string, commit: string, work: string, tools: FetchTools): Promise<FetchedTarball> {
  const checkout = join(work, 'checkout');
  const commands = gitCommands(url, commit, checkout);
  const git = (args: readonly string[]) => runTool({ command: 'git', args, cwd: work, env: tools.environment, signal: tools.signal });
  await mkdir(work, { recursive: true });
  try {
    await git(commands.clone);
  } catch (error) {
    if (error instanceof ToolFailed) throw sourceInvalid(`git cannot clone ${url}: ${lastLine(error.stderr)}`);
    throw error;
  }
  try {
    await git(commands.checkout);
  } catch (error) {
    if (error instanceof ToolFailed) throw sourceInvalid(`the repository has no commit ${commit}`, { params: { commit } });
    throw error;
  }
  const head = (await git(commands.head)).stdout.trim();
  if (head !== commit) throw sourceInvalid(`the checkout is at ${head}, not ${commit}`);
  return { tarball: await packFolder(checkout, join(work, 'pack'), tools), integrity: `git:${commit}` };
}
