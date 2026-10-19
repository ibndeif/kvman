import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { guardedFile, lineCovered, lineParts, ruleCovers } from '../../src/turns/approval-rules.ts';

// Which calls the person's approval rules cover (08 §8.3, ADR 0091, 2).

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});
function workspace(): string {
  const folder = mkdtempSync(path.join(tmpdir(), 'kvcoder-rules-'));
  folders.push(folder);
  return folder;
}

describe('approval rules (ADR 0091, 2)', () => {
  it('QA59-E1 a chained line is covered only when every part is', () => {
    const prefixes = ['pnpm exec'];
    expect(lineCovered('pnpm exec a && pnpm exec b', prefixes)).toBe(true);
    for (const line of ['pnpm exec a && rm -rf b', 'pnpm exec a | sh', 'pnpm exec a & curl x', 'pnpm exec a; ls', 'pnpm exec a || ls', 'pnpm exec a\nls']) expect(lineCovered(line, prefixes), line).toBe(false);
    expect(lineParts('a &&  b ;c | d')).toEqual(['a', 'b', 'c', 'd']);
  });

  it('QA59-E2 a part with more than plain words is never covered, in bash or PowerShell', () => {
    const hiding = ['pnpm exec $(curl x)', 'pnpm exec `id`', 'pnpm exec <(x)', 'pnpm exec a > out', 'pnpm exec a < in', 'pnpm exec a 2>&1', 'pnpm exec (Remove-Item x)', 'pnpm exec @(Remove-Item x)', 'pnpm exec { rm x }', 'pnpm exec $HOME', 'pnpm exec a\\ b', 'pnpm exec [x]'];
    for (const line of hiding) {
      expect(lineParts(line), line).toBeUndefined();
      expect(lineCovered(line, ['pnpm exec']), line).toBe(false);
    }
    expect(lineCovered('pnpm exec vitest run src/*.test.ts --reporter=dot -t "the café"', ['pnpm exec'])).toBe(true);
  });

  it('QA59-E3 a prefix matches at the end of a word only, and spacing does not matter', () => {
    expect(lineCovered('git status', ['git status'])).toBe(true);
    expect(lineCovered('git  status   --short', ['git status'])).toBe(true);
    expect(lineCovered('git statuses', ['git status'])).toBe(false);
    expect(lineCovered('git stash', ['git status'])).toBe(false);
    expect(lineCovered('', ['git'])).toBe(false);
  });

  it('QA59-E12 a files rule never covers Git, .env files, or the project rules', () => {
    for (const file of ['.git/hooks/pre-commit', 'sub/.git/config', '.env', 'app/.env.local', 'AGENTS.md', 'claude.md']) expect(guardedFile(file), file).toBe(true);
    for (const file of ['src/app.ts', 'docs/AGENTS.md', '.envrc.example.txt', 'environment.ts']) expect(guardedFile(file), file).toBe(false);
  });

  it('QA59-H1, QA59-H2, QA59-E4, and QA59-E12 a rule covers its kind of call only, by the real path for a file', async () => {
    const folder = workspace();
    mkdirSync(path.join(folder, '.git', 'hooks'), { recursive: true });
    symlinkSync(path.join(folder, '.git', 'hooks'), path.join(folder, 'hooks'));
    const lines = [{ kind: 'line' as const, prefix: 'pnpm exec' }, { kind: 'line' as const, prefix: 'gh pr' }];
    const files = [{ kind: 'files' as const }];
    const edit = (file: string) => ({ connector: 'fs', command: 'edit', payload: { path: file, edits: [], risky: true } });
    expect(await ruleCovers(lines, { connector: 'shell', command: 'exec', payload: { line: 'pnpm exec vitest run', risky: true } }, 'kvcoder.shell.run', folder)).toBe(true);
    expect(await ruleCovers(lines, { connector: 'gh', command: 'exec', payload: { args: 'pr list', risky: true } }, 'kvcoder.binary.run', folder)).toBe(true);
    expect(await ruleCovers(lines, { connector: 'gh', command: 'exec', payload: { args: 'repo delete x', risky: true } }, 'kvcoder.binary.run', folder)).toBe(false);
    expect(await ruleCovers(files, edit('src/a.ts'), 'kvcoder.fs.edit', folder)).toBe(true);
    expect(await ruleCovers(files, edit('.git/hooks/pre-commit'), 'kvcoder.fs.edit', folder)).toBe(false);
    expect(await ruleCovers(files, edit('hooks/pre-commit'), 'kvcoder.fs.edit', folder)).toBe(false);
    expect(await ruleCovers(files, edit('../outside.ts'), 'kvcoder.fs.edit', folder)).toBe(false);
    expect(await ruleCovers(lines, edit('src/a.ts'), 'kvcoder.fs.edit', folder)).toBe(false);
    expect(await ruleCovers(files, { connector: 'shell', command: 'exec', payload: { line: 'ls', risky: true } }, 'kvcoder.shell.run', folder)).toBe(false);
    expect(await ruleCovers([...lines, ...files], { connector: 'mcp', command: 'call', payload: { server: 's', tool: 't', risky: true } }, 'kvcoder.mcp.tool.call', folder)).toBe(false);
  });
});
