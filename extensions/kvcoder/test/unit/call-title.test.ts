import { describe, expect, it } from 'vitest';
import { callTitle, shortCommand } from '../../web/src/call-title.ts';

describe('the derived title and the cut command (ADR 0009, 186, 195)', () => {
  it('QA9-E6 sixty characters stay, sixty-one are cut, a blank title is missing, and a given title is kept', () => {
    expect(callTitle(undefined, 'D'.repeat(60))).toBe('D'.repeat(60));
    expect(callTitle(undefined, 'D'.repeat(61))).toBe(`${'D'.repeat(60)}…`);
    expect(callTitle(undefined, '  Create the todo file  ')).toBe('Create the todo file');
    expect(callTitle('   ', 'Create the todo file')).toBe('Create the todo file');
    expect(callTitle('Run the tests', 'Checks the page.')).toBe('Run the tests');
    expect(callTitle(undefined, undefined)).toBeUndefined();
    expect(callTitle('   ', undefined)).toBeUndefined();
    expect(shortCommand('c'.repeat(200))).toBe('c'.repeat(200));
    expect(shortCommand('c'.repeat(201))).toBe(`${'c'.repeat(200)}…`);
    expect(shortCommand('npm test')).toBe('npm test');
  });
});
