import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { repositoryRoot } from '../support/npm-mirror.ts';
import { runBin } from '../support/run-bin.ts';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function failingInstall(): Record<string, string> {
  const cache = mkdtempSync(path.join(tmpdir(), 'kvman-new-cache-'));
  roots.push(cache);
  return { npm_config_registry: 'http://127.0.0.1:1/', npm_config_fetch_retries: '0', npm_config_cache: cache, npm_config_audit: 'false', npm_config_fund: 'false', npm_config_update_notifier: 'false' };
}

describe('kvman-new writes the harness files and the guides (09 §9.2, ADR 0010, 9, 17)', () => {
  it('QA17-H9 AGENTS.md, CLAUDE.md, docs/, and extension-docs/usage.md', async () => {
    const parent = mkdtempSync(path.join(tmpdir(), 'kvman-new-harness-'));
    roots.push(parent);
    // The install fails on purpose (a closed registry): the written files are kept, so they can be checked as they are.
    const run = await runBin('new/new-bin.js', ['notes', '--name', '@me/notes', '--namespace', 'notes'], { cwd: parent, env: failingInstall() });
    expect(run.exitCode).toBe(1);
    const folder = path.join(parent, 'notes');
    const agents = readFileSync(path.join(folder, 'AGENTS.md'), 'utf8');
    for (const mention of ['docs/', 'kvman-docs', 'npm run check', 'npm test', 'dist/']) expect(agents, mention).toContain(mention);
    expect(readFileSync(path.join(folder, 'CLAUDE.md'), 'utf8')).toBe('@AGENTS.md\n');
    expect(readdirSync(path.join(folder, 'docs')).sort()).toEqual(['conventions.md', 'i18n.md', 'presets.md', 'sdk.md']);
    for (const guide of ['conventions.md', 'i18n.md', 'presets.md', 'sdk.md']) {
      expect(readFileSync(path.join(folder, 'docs', guide))).toEqual(readFileSync(path.join(repositoryRoot, 'packages/testkit/docs', guide)));
    }
    expect(readFileSync(path.join(folder, 'extension-docs', 'usage.md'), 'utf8').startsWith('# Using notes')).toBe(true);
  });
});
