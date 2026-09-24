import { describe, expect, it } from 'vitest';
import { lintFixture, messagesOf } from './repository.ts';

const sourcePath = 'packages/kernel/src/fixture.ts';

describe('code rules (plan 14 §14.1)', () => {
  it('M0.1-E17 any is rejected', async () => {
    const messages = await lintFixture('uses-any.ts', sourcePath);
    expect(messagesOf(messages, '@typescript-eslint/no-explicit-any')).toHaveLength(1);
  });

  it('M0.1-E18 @ts-ignore, @ts-expect-error, and @ts-nocheck are rejected', async () => {
    for (const fixture of ['ts-ignore.ts', 'ts-expect-error.ts', 'ts-nocheck.ts']) {
      const messages = await lintFixture(fixture, sourcePath);
      expect(messagesOf(messages, '@typescript-eslint/ban-ts-comment')).toHaveLength(1);
    }
  });

  it('M0.1-E19 an eslint-disable comment is reported and fails the zero-warning lint', async () => {
    const messages = await lintFixture('eslint-disable.ts', sourcePath);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.message).toMatch(/noInlineConfig/);
  });

  it('M0.1-E20 default exports are rejected except an extension\'s defineExtension result', async () => {
    for (const fixture of ['default-export.ts', 'default-export-specifier.ts']) {
      const messages = await lintFixture(fixture, sourcePath);
      expect(messagesOf(messages, 'no-restricted-syntax')).toHaveLength(1);
    }
    expect(await lintFixture('default-export-define-extension.ts', 'extensions/todo/src/extension.ts')).toEqual([]);
    const other = await lintFixture('default-export.ts', 'extensions/todo/src/extension.ts');
    expect(messagesOf(other, 'no-restricted-syntax')).toHaveLength(1);
  });

  it('M0.1-E21 focused, skipped, and placeholder tests are rejected', async () => {
    const messages = await lintFixture('focused-and-skipped-tests.ts', 'packages/kernel/test/fixture.test.ts');
    expect(messagesOf(messages, 'no-restricted-properties')).toHaveLength(5);
  });

  it('M0.1-E22 TODO and FIXME comments are rejected', async () => {
    for (const fixture of ['todo-comment.ts', 'fixme-comment.ts']) {
      const messages = await lintFixture(fixture, sourcePath);
      expect(messagesOf(messages, 'no-warning-comments')).toHaveLength(1);
    }
  });
});
