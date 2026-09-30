import { describe, expect, it } from 'vitest';
import { lintFixture, messagesOf } from './repository.ts';

const source = 'packages/kernel/src/fixture.ts';

describe('code rules (CLAUDE.md §5)', () => {
  it('M1.1-E17 any is rejected', async () => {
    expect(messagesOf(await lintFixture('uses-any.ts', source), '@typescript-eslint/no-explicit-any')).toHaveLength(1);
  });

  it('M1.1-E18 @ts-ignore, @ts-expect-error, and @ts-nocheck are rejected', async () => {
    for (const fixture of ['ts-ignore.ts', 'ts-expect-error.ts', 'ts-nocheck.ts']) {
      expect(messagesOf(await lintFixture(fixture, source), '@typescript-eslint/ban-ts-comment'), fixture).toHaveLength(1);
    }
  });

  it('M1.1-E19 an eslint-disable comment turns no rule off and fails the zero-warning lint', async () => {
    const messages = await lintFixture('eslint-disable.ts', 'packages/sdk/src/fixture.ts');
    expect(messagesOf(messages, 'kvman/import-walls')).toHaveLength(1);
    const ignored = messages.filter((message) => message.ruleId === null);
    expect(ignored).toHaveLength(1);
    expect(ignored[0]?.severity).toBe(1);
    expect(ignored[0]?.message).toMatch(/noInlineConfig/);
  });

  it('M1.1-E20 TODO and FIXME comments are rejected', async () => {
    for (const fixture of ['todo-comment.ts', 'fixme-comment.ts']) {
      expect(messagesOf(await lintFixture(fixture, source), 'no-warning-comments'), fixture).toHaveLength(1);
    }
  });

  it("M1.1-E21 default exports are rejected except an extension's entry", async () => {
    for (const fixture of ['default-export.ts', 'default-export-specifier.ts']) {
      expect(messagesOf(await lintFixture(fixture, source), 'no-restricted-syntax'), fixture).toHaveLength(1);
    }
    expect(messagesOf(await lintFixture('default-export.ts', 'extensions/notes/src/other.ts'), 'no-restricted-syntax')).toHaveLength(1);
    expect(await lintFixture('default-export.ts', 'extensions/notes/src/index.ts')).toEqual([]);
  });

  it('M1.1-E22 focused, skipped, and placeholder tests are rejected', async () => {
    const messages = await lintFixture('focused-and-skipped-tests.ts', 'packages/kernel/test/fixture.test.ts');
    expect(messagesOf(messages, 'no-restricted-properties')).toHaveLength(3);
  });
});
