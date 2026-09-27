import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { jsonByteLength, limits } from '@kvman/protocol';
import { describe, expect, it } from 'vitest';
import { liveTextPieces, ProcessOutput, truncationMarker } from '../../src/index.ts';
import { ManualTimers } from '../scheduler/doubles.ts';
import { temporaryFolder } from './harness.ts';

describe('process output (plan 03 §3.7, ADR 0139)', () => {
  it('M2.6-E7 the tail, the cap, and live chunks never split a character and never pass their limits', async () => {
    const logPath = join(temporaryFolder('output'), 'job.log');
    const timers = new ManualTimers({ value: 0 });
    const streamed: string[] = [];
    let truncations = 0;
    const output = new ProcessOutput({ logPath, capBytes: 10_000, timers, live: (text) => streamed.push(text), truncated: () => { truncations += 1; } });
    const text = `${'a'.repeat(4094)}é${'€'.repeat(1000)}`;
    const bytes = Buffer.from(text, 'utf8');
    output.write(bytes.subarray(0, 4095));
    expect(streamed).toEqual([]);
    output.write(bytes.subarray(4095));
    timers.advance(100);
    expect(streamed.join('')).toBe(text);
    expect(streamed.every((piece) => jsonByteLength({ text: piece }) <= limits.liveChunkBytes)).toBe(true);

    output.write(Buffer.alloc(10_000 - bytes.length, 'x'));
    output.write(Buffer.from('after the cap'));
    output.write(Buffer.from('still dropped'));
    timers.advance(100);
    const summary = await output.finish();

    expect(truncations).toBe(1);
    expect(summary.truncated).toBe(true);
    // The last 4,096 bytes start one byte into a three-byte character, which the tail drops.
    expect(summary.tail).toBe(`${'€'.repeat(397)}${'x'.repeat(10_000 - bytes.length)}`);
    expect(Buffer.byteLength(summary.tail)).toBe(4095);
    const log = readFileSync(logPath);
    expect(log.length).toBe(10_000 + Buffer.byteLength(truncationMarker(10_000)));
    expect(log.subarray(10_000).toString('utf8')).toBe(truncationMarker(10_000));
    expect(streamed.join('')).not.toContain('after the cap');
    expect(liveTextPieces('\u0000'.repeat(3000)).every((piece) => jsonByteLength({ text: piece }) <= limits.liveChunkBytes)).toBe(true);
  });
});
