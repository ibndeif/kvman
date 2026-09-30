import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { m1Cost, useKvai, userSays } from './support/kvai-kernel.ts';

const kvai = useKvai();

const usage = { input: 10, output: 5, cacheRead: 4, cacheWrite: 2 };
const reply = { chunks: [{ text: 'ok' }], usage };
const tokens = usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
const m1CallCost = (usage.input * m1Cost.input + usage.output * m1Cost.output + usage.cacheRead * m1Cost.cacheRead + usage.cacheWrite * m1Cost.cacheWrite) / 1_000_000;

describe('usage totals (07 §7.1, ADR 0009, 60)', () => {
  it('M2.1-H6 usage adds up per workspace and per model', async () => {
    const { kernel, fake } = await kvai.start();
    const folder = path.join(kernel.homeFolder, 'other');
    mkdirSync(folder);
    const other = await kernel.exec('kernel.workspace.open', { path: folder });
    fake.reply(reply, reply, reply, reply);
    const call = (model: string, workspaceId?: string) =>
      kernel.exec('kvai.complete', { model, messages: [userSays('hi')] }, workspaceId === undefined ? {} : { workspaceId });
    await call('fake/m1');
    await call('fake/m1');
    await call('fake/m2');
    await call('fake/m1', other.id);
    const home = await kernel.exec('kvai.usage.get', {});
    expect(home).toEqual([
      { model: 'fake/m1', input: 20, output: 10, cacheRead: 8, cacheWrite: 4, cost: expect.closeTo(2 * m1CallCost, 12) },
      { model: 'fake/m2', ...usage, cost: 0 },
    ]);
    expect(await kernel.exec('kvai.usage.get', {}, { workspaceId: other.id })).toEqual([{ model: 'fake/m1', ...usage, cost: expect.closeTo(m1CallCost, 12) }]);
    expect(await kernel.exec('kvai.usage.total.get', {})).toEqual({ tokens: 3 * tokens, cost: expect.closeTo(2 * m1CallCost, 12) });
    expect(await kernel.exec('kvai.usage.total.get', {}, { workspaceId: other.id })).toEqual({ tokens, cost: expect.closeTo(m1CallCost, 12) });
  });
});
