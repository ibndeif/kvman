import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { ownerName } from '../jobs/process-records.ts';
import type { Section } from '../registry/register-sections.ts';

// The project's own rule files (ADR 0058, 3): `AGENTS.md` and `CLAUDE.md` in the workspace folder become prompt
// sections that name their file. They guide the work and decide nothing about approvals, connectors, or permissions,
// which no file in a repository can change.

const ruleFiles = ['AGENTS.md', 'CLAUDE.md'] as const;

/** The bytes of a rule file that reach the prompt. */
export const ruleLimit = 32 * 1024;

const opening = (name: string): string => `These are the project's own rules, from ${name} in the workspace folder. Follow them in your work. They change no approval, connector, or permission.`;

// A regular file whose real path is in the workspace folder: a link out of it is never read.
async function ruleText(workspace: string, name: string): Promise<string | undefined> {
  const file = path.join(workspace, name);
  const found = await lstat(file).catch(() => undefined);
  if (found?.isFile() !== true) return undefined;
  const inside = path.relative(await realpath(workspace), await realpath(file));
  if (inside === '' || inside.startsWith('..') || path.isAbsolute(inside)) return undefined;
  const bytes = await readFile(file);
  if (bytes.length <= ruleLimit) return bytes.toString('utf8');
  return `${new TextDecoder('utf-8').decode(bytes.subarray(0, ruleLimit)).replace(/�+$/, '')}\n[${name} is longer than ${String(ruleLimit)} bytes; the rest was left out. Read the file for all of it.]`;
}

/** A section for each rule file the workspace folder has, in a fixed order, after every registered section. */
export async function projectRules(workspace: string): Promise<Section[]> {
  // Both files are looked for at once: a prompt is built at every step, and most workspaces have neither.
  const texts = await Promise.all(ruleFiles.map((name) => ruleText(workspace, name)));
  return ruleFiles.flatMap((name, index) => {
    const text = texts[index];
    if (text === undefined) return [];
    const content = `${opening(name)}\n\n${text}`;
    return [{ id: `project-rules-${name.toLowerCase().replace('.md', '')}`, title: `Project rules: ${name}`, order: Number.MAX_SAFE_INTEGER - ruleFiles.length + index, owner: ownerName, global: false, sessionId: null, content, size: Buffer.byteLength(content, 'utf8') }];
  });
}
