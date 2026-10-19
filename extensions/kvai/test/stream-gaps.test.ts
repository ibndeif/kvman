import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { silenceMeter } from '../src/complete/silences.ts';
import { useKvai, userSays } from './support/kvai-kernel.ts';

const kvai = useKvai();

// A model call's silences, logged as numbers (07 §7.1, ADR 0094, 2).
describe("a model call's silences (ADR 0094, 2)", { timeout: 30_000 }, () => {
  it('QA62-H3 the meter gives the first event and the longest gap', () => {
    const times = [1000, 1400, 1450, 2450, 2500];
    const meter = silenceMeter(() => times.shift() ?? 0);
    for (let index = 0; index < 4; index += 1) meter.mark();
    expect(meter.silences()).toEqual({ firstEventMs: 400, longestGapMs: 1000, events: 4 });
    expect(silenceMeter(() => 5).silences()).toEqual({ firstEventMs: null, longestGapMs: 0, events: 0 });
  });

  it('QA62-H3 each call logs its model and silences, and none of its text', async () => {
    const { kernel, fake } = await kvai.start();
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    fake.reply({ chunks: [{ text: 'secret words before' }, { wait: held }, { text: ' and after' }] });
    const done = kernel.exec('kvai.complete', { model: 'fake/m1', messages: [userSays('a private question')] });
    // The hold starts once the fake has the request and has sent the first text.
    await vi.waitFor(() => expect(fake.requests()).toHaveLength(1));
    setTimeout(release, 400);
    await done;
    const lines = readFileSync(path.join(kernel.home, 'logs', 'kvman.log'), 'utf8').split('\n').filter((line) => line.includes('A model call ended its stream.'));
    expect(lines).toHaveLength(1);
    const logged = JSON.parse(lines[0] ?? '{}') as Record<string, unknown>;
    expect(logged).toMatchObject({ model: 'fake/m1' });
    expect(Number(logged['longestGapMs'])).toBeGreaterThanOrEqual(200);
    expect(typeof logged['firstEventMs']).toBe('number');
    for (const hidden of ['secret words', 'and after', 'private question']) expect(lines[0]).not.toContain(hidden);
  });
});
