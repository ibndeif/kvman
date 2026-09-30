import { describe, expect, it } from 'vitest';
import { terminalLine } from '../../src/logging/terminal-lines.ts';

describe('the short terminal log (ADR 0009, 49)', () => {
  it('M1.8-E24 a record is one line: its local time, its level, and its message, without its fields', () => {
    const time = new Date(2026, 8, 30, 7, 5, 9).getTime();
    expect(terminalLine(JSON.stringify({ level: 40, time, msg: 'The browser could not be opened.', reason: 'spawn xdg-open ENOENT' }))).toBe(
      '07:05:09 WARN The browser could not be opened.\n',
    );
    expect(terminalLine(JSON.stringify({ level: 20, time, msg: 'debugging' }))).toBe('07:05:09 DEBUG debugging\n');
    expect(terminalLine(JSON.stringify({ level: 30, time, msg: 'informing' }))).toBe('07:05:09 INFO informing\n');
    expect(terminalLine(JSON.stringify({ level: 50, time, msg: 'failing' }))).toBe('07:05:09 ERROR failing\n');
  });
});
