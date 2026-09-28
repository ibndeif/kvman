import { afterEach, describe, expect, it, vi } from 'vitest';
import { workspaceA, workspaceB } from '../hosts/harness.ts';
import { command, person, problemOf, sendAs, type InstallFixture } from '../install/harness.ts';
import { disable, enable, grantsOf, rows, valueOf } from '../workspaces/harness.ts';
import { installFakeProvider, llmTests, openLlmFixture, refreshWait, waitForFakeModel } from './harness.ts';

let fixture: InstallFixture | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

const fakeModel = { provider: 'fake', id: 'fake-model' };

async function enabledAsker(options: Record<string, never> | { chunks: string[]; thinking: string } = {}): Promise<InstallFixture> {
  const current = fixture as InstallFixture;
  await installFakeProvider(current, options);
  valueOf(await enable(current, workspaceA, '@kvman/fake-provider'));
  valueOf(await enable(current, workspaceA, '@acme/asker'));
  await waitForFakeModel(current);
  return current;
}

describe('LLM call path (plan 03 §3.12, 05 §5.11, ADR 0153)', llmTests, () => {
  it('M2.9-H1 deltas stream as the caller live events with run = the asker message, and the reply is the result', async () => {
    fixture = await openLlmFixture();
    const current = await enabledAsker({ chunks: ['Hel', 'lo'], thinking: 'hmm' });
    const asked = await sendAs(current, person, 'asker.ask', {
      purpose: 'chat', model: fakeModel, live: { text: 'asker.tokens.generated:s1', thinking: 'asker.thinking.generated:s1' },
    }, workspaceA);
    expect(await current.runtime.awaitReply(asked)).toEqual({
      ok: true,
      value: { content: 'ok', thinking: 'hmm', usage: { input: 10, output: 5 }, model: fakeModel, stopReason: 'end' },
    });
    expect(current.live.filter((frame) => frame.run === asked).map((frame) => [frame.type, frame.key, frame.chunk])).toEqual([
      ['asker.tokens.generated', 's1', { text: 'Hel' }],
      ['asker.tokens.generated', 's1', { text: 'lo' }],
      ['asker.thinking.generated', 's1', { text: 'hmm' }],
    ]);

    const again = await sendAs(current, person, 'asker.ask', {
      purpose: 'chat', model: fakeModel, live: { text: 'asker.tokens.generated:s2' },
    }, workspaceA);
    expect(await current.runtime.awaitReply(again)).toMatchObject({ ok: true });
    expect(current.live.filter((frame) => frame.run === again && frame.type === 'asker.thinking.generated')).toEqual([]);
    expect(current.live.filter((frame) => frame.run === again).map((frame) => frame.chunk)).toEqual([{ text: 'Hel' }, { text: 'lo' }]);
  });

  it('M2.9-H2 a failure after the call retries the asker but calls the provider once', async () => {
    fixture = await openLlmFixture();
    const current = await enabledAsker();
    const asked = await sendAs(current, person, 'asker.ask', { purpose: 'chat', model: fakeModel, failOnce: true }, workspaceA);
    await vi.waitFor(() => {
      expect(rows(current, 'SELECT state, attempts FROM messages WHERE id = ?', asked)).toEqual([{ state: 'pending', attempts: 1 }]);
    }, refreshWait);
    current.timers.advance(1_000);
    expect(await current.runtime.awaitReply(asked)).toMatchObject({ ok: true, value: { content: 'ok' } });
    expect(rows(current, "SELECT id FROM messages WHERE type = 'kernel.llm.complete'")).toHaveLength(1);
    expect(rows(current, 'SELECT message_id FROM llm_usage')).toHaveLength(1);
  });

  it('M2.9-E8 asking and counting without the llm capability are denied', async () => {
    const current = fixture = await openLlmFixture();
    valueOf(await enable(current, workspaceA, '@acme/mute'));
    expect(problemOf(await command(current, 'mute.ask', { purpose: 'chat', model: fakeModel }, person, workspaceA)))
      .toMatchObject({ code: 'CAPABILITY_DENIED' });
    expect(problemOf(await command(current, 'mute.count', { model: fakeModel }, person, workspaceA)))
      .toMatchObject({ code: 'CAPABILITY_DENIED' });
  });

  it('M2.9-E9 live targets outside the caller own text events fail at admission and never call the provider', async () => {
    fixture = await openLlmFixture();
    const current = await enabledAsker();
    for (const live of [
      { text: 'mute.tokens.generated:s1' },
      { text: 'asker.progress.updated:s1' },
      { text: 'kernel.extension.installed:s1' },
    ]) {
      expect(problemOf(await command(current, 'asker.ask', { purpose: 'chat', model: fakeModel, live }, person, workspaceA)))
        .toMatchObject({ code: 'VALIDATION_FAILED' });
    }
    expect(rows(current, "SELECT attempts FROM messages WHERE type = 'kernel.llm.complete'")).toEqual([
      { attempts: 0 }, { attempts: 0 }, { attempts: 0 },
    ]);
    expect(rows(current, 'SELECT message_id FROM llm_usage')).toEqual([]);
  });

  it('M2.9-E10 asking with no provider enabled fails LLM_NOT_CONFIGURED', async () => {
    const current = fixture = await openLlmFixture();
    valueOf(await enable(current, workspaceA, '@acme/asker'));
    expect(problemOf(await command(current, 'asker.ask', { purpose: 'chat', model: fakeModel }, person, workspaceA)))
      .toMatchObject({ code: 'LLM_NOT_CONFIGURED' });
  });

  it('M2.9-E11 the purpose default resolves the model; a missing or unknown one does not', async () => {
    fixture = await openLlmFixture();
    const current = await enabledAsker();
    valueOf(await command(current, 'kernel.llm.defaults.set', { workspaceId: workspaceA, purpose: 'chat', model: fakeModel }));
    expect(await command(current, 'asker.ask', { purpose: 'chat' }, person, workspaceA))
      .toMatchObject({ ok: true, value: { model: fakeModel } });
    expect(problemOf(await command(current, 'asker.ask', { purpose: 'summary' }, person, workspaceA)))
      .toMatchObject({ code: 'LLM_MODEL_NOT_FOUND' });
    expect(problemOf(await command(current, 'asker.ask', { purpose: 'chat', model: { provider: 'fake', id: 'nope' } }, person, workspaceA)))
      .toMatchObject({ code: 'LLM_MODEL_NOT_FOUND' });
  });

  it('M2.9-E14 a global call uses the global default with an empty workspace, or fails unconfigured', async () => {
    const current = fixture = await openLlmFixture();
    await installFakeProvider(current, {});
    valueOf(await enable(current, workspaceB, '@kvman/fake-provider'));
    valueOf(await enable(current, workspaceA, '@acme/asker'));
    await waitForFakeModel(current);
    valueOf(await command(current, 'kernel.llm.defaults.set', { purpose: 'chat', model: fakeModel }));
    expect(await command(current, 'asker.ask-global', { purpose: 'chat' }, person))
      .toMatchObject({ ok: true, value: { model: fakeModel } });
    expect(rows(current, 'SELECT ws FROM llm_usage')).toEqual([{ ws: '' }]);
    valueOf(await disable(current, workspaceB, '@kvman/fake-provider'));
    expect(problemOf(await command(current, 'asker.ask-global', { purpose: 'chat' }, person)))
      .toMatchObject({ code: 'LLM_NOT_CONFIGURED' });
  });

  it('M2.9-E15 a sandboxed provider streams deltas and the result like any other', async () => {
    const current = fixture = await openLlmFixture();
    await installFakeProvider(current, { chunks: ['Hel', 'lo'], thinking: 'hmm' });
    valueOf(await enable(current, workspaceA, '@kvman/fake-provider', grantsOf(current, '@kvman/fake-provider', 'sandboxed')));
    valueOf(await enable(current, workspaceA, '@acme/asker'));
    await waitForFakeModel(current);
    const asked = await sendAs(current, person, 'asker.ask', {
      purpose: 'chat', model: fakeModel, live: { text: 'asker.tokens.generated:s1' },
    }, workspaceA);
    expect(await current.runtime.awaitReply(asked)).toMatchObject({ ok: true, value: { content: 'ok' } });
    expect(current.live.filter((frame) => frame.run === asked).map((frame) => [frame.type, frame.chunk])).toEqual([
      ['asker.tokens.generated', { text: 'Hel' }],
      ['asker.tokens.generated', { text: 'lo' }],
    ]);
  });

  it('M2.9-E16 a running provider call counts against its extension host load, then cancels', async () => {
    const current = fixture = await openLlmFixture();
    valueOf(await enable(current, workspaceA, '@acme/slow'));
    valueOf(await enable(current, workspaceA, '@acme/asker'));
    await vi.waitFor(() => {
      expect(rows(current, "SELECT id FROM llm_models WHERE provider = 'slow'")).toHaveLength(1);
    }, refreshWait);
    const asked = await sendAs(current, person, 'asker.ask', {
      purpose: 'chat', model: { provider: 'slow', id: 'slow-model' },
    }, workspaceA);
    await vi.waitFor(() => {
      expect(current.runtime.hosts.load({ extension: '@acme/slow', workspaceId: workspaceA, kind: 'command' }).inFlight).toBe(1);
    }, refreshWait);
    expect(current.runtime.hosts.hosts().find((host) => host.extension === '@acme/slow')?.worker.inFlight).toBe(1);
    valueOf(await command(current, 'kernel.cancel', { messageId: asked }, person));
    expect(await current.runtime.awaitReply(asked)).toMatchObject({ ok: false, problem: { code: 'CANCELLED' } });
    expect(rows(current, 'SELECT message_id FROM llm_usage')).toEqual([]);
  });
});
