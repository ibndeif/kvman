import { describe, expect, it } from 'vitest';
import { lineCovered, lineParts, ruleCovers } from '../../src/turns/approval-rules.ts';

// Which lines the person's approval rules cover (08 §8.3, ADR 0091, 2).

describe('approval rules (ADR 0091, 2)', () => {
  it('QA59-E1 a chained line is covered only when every part is', () => {
    const prefixes = ['pnpm exec'];
    expect(lineCovered('pnpm exec a && pnpm exec b', prefixes)).toBe(true);
    for (const line of ['pnpm exec a && rm -rf b', 'pnpm exec a | sh', 'pnpm exec a & curl x', 'pnpm exec a; ls', 'pnpm exec a || ls', 'pnpm exec a\nls']) expect(lineCovered(line, prefixes), line).toBe(false);
    expect(lineParts('a &&  b ;c | d')).toEqual(['a', 'b', 'c', 'd']);
  });

  it('QA59-E2 syntax that could hide a command is never covered', () => {
    for (const line of ['pnpm exec $(curl x)', 'pnpm exec `id`', 'pnpm exec <(x)', 'pnpm exec >(x)', 'pnpm exec a > out', 'pnpm exec a < in', 'pnpm exec a 2>&1']) {
      expect(lineParts(line), line).toBeUndefined();
      expect(lineCovered(line, ['pnpm exec']), line).toBe(false);
    }
  });

  it('QA59-E3 a prefix matches at the end of a word only, and spacing does not matter', () => {
    expect(lineCovered('git status', ['git status'])).toBe(true);
    expect(lineCovered('git  status   --short', ['git status'])).toBe(true);
    expect(lineCovered('git statuses', ['git status'])).toBe(false);
    expect(lineCovered('git stash', ['git status'])).toBe(false);
    expect(lineCovered('', ['git'])).toBe(false);
  });

  it('QA59-H1, QA59-H2, and QA59-E4 a rule covers its kind of call only', () => {
    const lines = [{ kind: 'line' as const, prefix: 'pnpm exec' }, { kind: 'line' as const, prefix: 'gh pr' }];
    const files = [{ kind: 'files' as const }];
    expect(ruleCovers(lines, { connector: 'shell', command: 'exec', payload: { line: 'pnpm exec vitest run', risky: true } }, 'kvcoder.shell.run')).toBe(true);
    expect(ruleCovers(lines, { connector: 'gh', command: 'exec', payload: { args: 'pr list', risky: true } }, 'kvcoder.binary.run')).toBe(true);
    expect(ruleCovers(lines, { connector: 'gh', command: 'exec', payload: { args: 'repo delete x', risky: true } }, 'kvcoder.binary.run')).toBe(false);
    expect(ruleCovers(files, { connector: 'fs', command: 'edit', payload: { path: 'a', edits: [], risky: true } }, 'kvcoder.fs.edit')).toBe(true);
    expect(ruleCovers(lines, { connector: 'fs', command: 'edit', payload: { path: 'a', edits: [], risky: true } }, 'kvcoder.fs.edit')).toBe(false);
    expect(ruleCovers(files, { connector: 'shell', command: 'exec', payload: { line: 'ls', risky: true } }, 'kvcoder.shell.run')).toBe(false);
    expect(ruleCovers([...lines, ...files], { connector: 'mcp', command: 'call', payload: { server: 's', tool: 't', risky: true } }, 'kvcoder.mcp.tool.call')).toBe(false);
  });
});
