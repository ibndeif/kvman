import { describe, expect, it } from 'vitest';
import { parseMessage } from '../../src/i18n/icu-messages.ts';

describe('ICU arguments', () => {
  it('M2.11-E44 reads arguments including nested options, excluding tags, # and quoted braces', () => {
    const cases: Array<[string, string[]]> = [
      ['Hello {name}', ['name']],
      ['{count, number} on {when, date}', ['count', 'when']],
      ['{choice, select, one {{name} has {total, number}} other {{name} waits}}', ['choice', 'name', 'total']],
      ['{count, plural, offset:1 one {# file} other {# files}}', ['count']],
      ['Click <b>here</b>', []],
      ["'{'literal'}'", []],
    ];
    for (const [message, names] of cases) {
      const result = parseMessage(message);
      expect(result.ok).toBe(true);
      if (result.ok) expect([...result.parameters].sort()).toEqual(names.sort());
    }
  });
});
