import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openProcessLog, processLogLimitBytes } from '../../src/processes/process-log.ts';

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

describe('a process log (02 §2.16)', () => {
  it('M1.6-E34 going over 10 MB drops the oldest half, and the newest output stays', () => {
    const folder = mkdtempSync(path.join(tmpdir(), 'kvman-process-log-'));
    folders.push(folder);
    const file = path.join(folder, 'deep', 'server.log');
    const log = openProcessLog(file);
    const mebibyte = 1024 * 1024;
    for (let chunk = 0; chunk < 11; chunk += 1) log.write(Buffer.alloc(mebibyte, chunk.toString(16)));
    log.write(Buffer.from('the newest line\n'));
    log.close();
    expect(statSync(file).size).toBeLessThanOrEqual(processLogLimitBytes);
    const text = readFileSync(file, 'latin1');
    expect(text.endsWith('the newest line\n')).toBe(true);
    expect(text.includes('0')).toBe(false);
  });
});
