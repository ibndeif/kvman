import { afterEach, describe, expect, it, vi } from 'vitest';
import { workspaceA, workspaceB } from '../hosts/harness.ts';
import { command, extensionActor, person, type InstallFixture } from '../install/harness.ts';
import { disable, enable, query, rows, valueOf } from '../workspaces/harness.ts';
import { installFakeProvider, llmTests, refreshWait, openLlmFixture, waitForFakeModel } from './harness.ts';

let fixture: InstallFixture | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

async function opened(): Promise<InstallFixture> {
  fixture = await openLlmFixture();
  return fixture;
}

function dayKey(at: number): string {
  const date = new Date(at);
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

describe('LLM tokens and usage (plan 03 §3.12, ADR 0154)', llmTests, () => {
  it('M2.9-E23 tokens.count answers the provider count, else the estimate', async () => {
    const current = await opened();
    valueOf(await enable(current, workspaceA, '@acme/lister-llm'));
    valueOf(await enable(current, workspaceA, '@acme/slow'));
    valueOf(await enable(current, workspaceA, '@acme/asker'));
    await vi.waitFor(() => {
      expect(rows(current, 'SELECT id FROM llm_models WHERE provider = ?', 'lister')).toHaveLength(1);
      expect(rows(current, 'SELECT id FROM llm_models WHERE provider = ?', 'slow')).toHaveLength(1);
    }, refreshWait);
    const asker = extensionActor('@acme/asker');
    expect(await query(current, 'kernel.llm.tokens.count', {
      purpose: 'chat', model: { provider: 'lister', id: 'lister-static' }, messages: [{ role: 'user', content: 'hello' }],
    }, asker, workspaceA)).toEqual({ ok: true, value: { tokens: 42, exact: true } });
    // Slow registers no countTokens, so the kernel estimates ceil(5 / 4).
    expect(await query(current, 'kernel.llm.tokens.count', {
      purpose: 'chat', model: { provider: 'slow', id: 'slow-model' }, messages: [{ role: 'user', content: 'hello' }],
    }, asker, workspaceA)).toEqual({ ok: true, value: { tokens: 2, exact: false } });
  });

  it('M2.9-E24 usage.get sums the rows in range, grouped or totaled', async () => {
    const current = await opened();
    const first = Date.UTC(2026, 2, 4, 12);
    const second = first + 86_400_000;
    current.connection.prepare(`INSERT INTO llm_usage
      (message_id, ws, caller, provider, model, input, output, cache_read, cache_write, cost_usd, correlation_id, at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('m1', workspaceA, '@acme/asker', 'lister', 'lister-static', 10, 5, 0, 0, 0.002, '01JAZ3K4M5N6P7Q8R9S0T1V2W3', first);
    current.connection.prepare(`INSERT INTO llm_usage
      (message_id, ws, caller, provider, model, input, output, cache_read, cache_write, cost_usd, correlation_id, at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('m2', workspaceA, '@acme/asker', 'slow', 'slow-model', 20, 10, 0, 0, null, '01JAZ3K4M5N6P7Q8R9S0T1V2W4', second);
    current.connection.prepare(`INSERT INTO llm_usage
      (message_id, ws, caller, provider, model, input, output, cache_read, cache_write, cost_usd, correlation_id, at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('m3', workspaceB, '@acme/mute', 'lister', 'lister-static', 100, 50, 0, 0, 0.25, '01JAZ3K4M5N6P7Q8R9S0T1V2W5', first);

    const total = await query(current, 'kernel.llm.usage.get', { workspaceId: workspaceA });
    expect(total).toMatchObject({ ok: true });
    const [row] = (total as { ok: true; value: { rows: Array<Record<string, unknown>> } }).value.rows;
    expect(row).toMatchObject({ key: null, calls: 2, input: 30, output: 15, cacheRead: 0, cacheWrite: 0 });
    expect(Number(row?.['costUsd'])).toBeCloseTo(0.002, 10);

    expect(await query(current, 'kernel.llm.usage.get', { workspaceId: workspaceA, from: first, to: second })).toEqual({
      ok: true,
      value: { rows: [{ key: null, calls: 1, input: 10, output: 5, cacheRead: 0, cacheWrite: 0, costUsd: 0.002 }] },
    });
    expect(await query(current, 'kernel.llm.usage.get', { workspaceId: workspaceB })).toEqual({
      ok: true,
      value: { rows: [{ key: null, calls: 1, input: 100, output: 50, cacheRead: 0, cacheWrite: 0, costUsd: 0.25 }] },
    });
    expect(await query(current, 'kernel.llm.usage.get', { workspaceId: workspaceA, groupBy: 'model' })).toEqual({
      ok: true,
      value: {
        rows: [
          { key: 'lister/lister-static', calls: 1, input: 10, output: 5, cacheRead: 0, cacheWrite: 0, costUsd: 0.002 },
          { key: 'slow/slow-model', calls: 1, input: 20, output: 10, cacheRead: 0, cacheWrite: 0, costUsd: 0 },
        ],
      },
    });
    expect(await query(current, 'kernel.llm.usage.get', { workspaceId: workspaceA, groupBy: 'day' })).toEqual({
      ok: true,
      value: {
        rows: [
          { key: dayKey(first), calls: 1, input: 10, output: 5, cacheRead: 0, cacheWrite: 0, costUsd: 0.002 },
          { key: dayKey(second), calls: 1, input: 20, output: 10, cacheRead: 0, cacheWrite: 0, costUsd: 0 },
        ],
      },
    });
    expect(await query(current, 'kernel.llm.usage.get', { workspaceId: workspaceA, from: second + 1 })).toEqual({
      ok: true,
      value: { rows: [{ key: null, calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0 }] },
    });
    expect(await query(current, 'kernel.llm.usage.get', { workspaceId: workspaceA, from: second + 1, groupBy: 'model' })).toEqual({
      ok: true, value: { rows: [] },
    });
  });

  it('M2.9-H4 calls in two workspaces write priced and explicit costs, summed by extension', async () => {
    const current = fixture = await opened();
    const model = { provider: 'fake', id: 'fake-model' };
    await installFakeProvider(current, { usage: { input: 1000, output: 500 } });
    valueOf(await enable(current, workspaceA, '@kvman/fake-provider'));
    valueOf(await enable(current, workspaceA, '@acme/asker'));
    valueOf(await enable(current, workspaceB, '@acme/asker'));
    await waitForFakeModel(current);
    expect(await command(current, 'asker.ask', { purpose: 'chat', model }, person, workspaceA)).toMatchObject({ ok: true });
    expect(await command(current, 'asker.ask', { purpose: 'chat', model }, person, workspaceA)).toMatchObject({ ok: true });

    valueOf(await disable(current, workspaceA, '@kvman/fake-provider'));
    valueOf(await command(current, 'kernel.extension.uninstall', { name: '@kvman/fake-provider', deleteData: true }));
    await installFakeProvider(current, { usage: { input: 1000, output: 500 }, costUsd: 0.25 });
    valueOf(await enable(current, workspaceB, '@kvman/fake-provider'));
    await waitForFakeModel(current);
    expect(await command(current, 'asker.ask', { purpose: 'chat', model }, person, workspaceB)).toMatchObject({ ok: true });

    expect(rows(current, 'SELECT message_id, ws, caller, provider, model, input, output FROM llm_usage ORDER BY rowid')).toEqual([
      { message_id: expect.any(String), ws: workspaceA, caller: '@acme/asker', provider: 'fake', model: 'fake-model', input: 1000, output: 500 },
      { message_id: expect.any(String), ws: workspaceA, caller: '@acme/asker', provider: 'fake', model: 'fake-model', input: 1000, output: 500 },
      { message_id: expect.any(String), ws: workspaceB, caller: '@acme/asker', provider: 'fake', model: 'fake-model', input: 1000, output: 500 },
    ]);
    const costs = rows(current, 'SELECT cost_usd FROM llm_usage ORDER BY rowid').map((row) => Number(row['cost_usd']));
    expect(costs[0]).toBeCloseTo(0.002, 10);
    expect(costs[1]).toBeCloseTo(0.002, 10);
    expect(costs[2]).toBe(0.25);
    const grouped = await query(current, 'kernel.llm.usage.get', { groupBy: 'extension' }, person);
    expect(grouped).toMatchObject({
      ok: true, value: { rows: [{ key: '@acme/asker', calls: 3, input: 3000, output: 1500, cacheRead: 0, cacheWrite: 0 }] },
    });
    const [extension] = (grouped as { ok: true; value: { rows: Array<{ costUsd: number }> } }).value.rows;
    expect(Number(extension?.costUsd)).toBeCloseTo(0.254, 10);
  });
});
