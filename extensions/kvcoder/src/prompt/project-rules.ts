import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { ownerName } from '../jobs/process-records.ts';
import type { Section } from '../registry/register-sections.ts';
import type { KeptRule } from '../schemas/kept-rule.ts';

// The project's own rule files (ADR 0058, 3; ADR 0108, 6): `AGENTS.md` and `CLAUDE.md` in the workspace folder and in
// each folder directly inside it become prompt sections that name their file. They guide the work and decide nothing
// about approvals, connectors, or permissions, which no file in a repository can change.

const ruleFiles = ['AGENTS.md', 'CLAUDE.md'] as const;

/** The bytes of a rule file that reach the prompt. */
export const ruleLimit = 32 * 1024;

const opening = (name: string): string => `These are the project's own rules, from ${name} in the workspace folder. Follow them in your work. They change no approval, connector, or permission.`;

/** A rule file's text as it reaches the prompt, cut at 32 KB; `undefined` when it isn't a regular file inside the workspace folder. */
export async function ruleText(workspace: string, name: string): Promise<string | undefined> {
  const file = path.join(workspace, name);
  const found = await lstat(file).catch(() => undefined);
  if (found?.isFile() !== true) return undefined;
  const inside = path.relative(await realpath(workspace), await realpath(file));
  if (inside === '' || inside.startsWith('..') || path.isAbsolute(inside)) return undefined;
  const bytes = await readFile(file);
  if (bytes.length <= ruleLimit) return bytes.toString('utf8');
  return `${new TextDecoder('utf-8').decode(bytes.subarray(0, ruleLimit)).replace(/�+$/, '')}\n[${name} is longer than ${String(ruleLimit)} bytes; the rest was left out. Read the file for all of it.]`;
}

// The folders directly inside the workspace folder that may hold rule files: not a link, not hidden, not node_modules.
async function ruleFolders(workspace: string): Promise<string[]> {
  const entries = await readdir(workspace, { withFileTypes: true }).catch(() => []);
  return entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules').map((entry) => entry.name).sort();
}

/** The rule files the workspace has, the folder's own first, then each folder's by name, with their text. */
export async function readRules(workspace: string): Promise<KeptRule[]> {
  const names = [...ruleFiles, ...(await ruleFolders(workspace)).flatMap((folder) => ruleFiles.map((file) => `${folder}/${file}`))];
  // Every file is looked for at once: most folders have none.
  const texts = await Promise.all(names.map((name) => ruleText(workspace, name)));
  return names.flatMap((name, index) => {
    const content = texts[index];
    return content === undefined ? [] : [{ path: name, content, told: null }];
  });
}

/** The rule files as prompt sections, after every registered section, in their order. */
export function ruleSections(rules: readonly KeptRule[]): Section[] {
  return rules.map((rule, index) => {
    const content = `${opening(rule.path)}\n\n${rule.content}`;
    const id = `project-rules-${rule.path.toLowerCase().replace(/\.md$/, '').replace(/[^a-z0-9]+/g, '-')}`;
    return { id, title: `Project rules: ${rule.path}`, order: Number.MAX_SAFE_INTEGER - rules.length + index, owner: ownerName, global: false, sessionId: null, content, size: Buffer.byteLength(content, 'utf8') };
  });
}
