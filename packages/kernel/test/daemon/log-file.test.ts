import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { logFileDefaults, RotatingLogFile } from '../../src/index.ts';
import { temporaryFolder } from './boot.ts';

const day = 24 * 60 * 60 * 1000;

function rotated(folder: string): string[] {
  return readdirSync(folder).filter((name) => name !== 'kernel.log').sort();
}

describe('the kernel log file (plan 13 §13.3, ADR 0093)', () => {
  it('M1.8-E66 the log rotates at size and at a day change and keeps 14 files', () => {
    expect(logFileDefaults).toEqual({ maxBytes: 50 * 1024 * 1024, keep: 14 });
    const folder = temporaryFolder();
    const clock = { now: Date.UTC(2026, 8, 25, 12) };
    const file = new RotatingLogFile({ folder, now: () => clock.now, maxBytes: 20 });
    file.write('0123456789\n');
    file.write('abcdefghij\n');
    expect(rotated(folder)).toEqual(['kernel.2026-09-25.1.log']);
    expect(readFileSync(join(folder, 'kernel.2026-09-25.1.log'), 'utf8')).toBe('0123456789\n');
    expect(readFileSync(join(folder, 'kernel.log'), 'utf8')).toBe('abcdefghij\n');

    clock.now += day;
    file.write('next day\n');
    expect(rotated(folder)).toEqual(['kernel.2026-09-25.1.log', 'kernel.2026-09-25.2.log']);
    expect(readFileSync(join(folder, 'kernel.log'), 'utf8')).toBe('next day\n');

    for (let line = 0; line < 14; line += 1) file.write('0123456789abcdef\n');
    expect(rotated(folder)).toHaveLength(14);
    expect(rotated(folder)).not.toContain('kernel.2026-09-25.1.log');
    expect(rotated(folder)).not.toContain('kernel.2026-09-25.2.log');
    expect(rotated(folder)).toContain('kernel.2026-09-26.14.log');
    file.close();
  });
});
