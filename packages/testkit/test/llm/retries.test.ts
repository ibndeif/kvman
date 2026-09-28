import { afterEach, describe, expect, it, vi } from 'vitest';
import { workspaceA } from '../hosts/harness.ts';
import { command, person, problemOf, sendAs, type InstallFixture } from '../install/harness.ts';
import { enable, rows, valueOf } from '../workspaces/harness.ts';
import { installFakeProvider, llmTests, openLlmFixture, refreshWait, waitForFakeModel } from './harness.ts';

let fixture: InstallFixture | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

const fakeModel = { provider: 'fake', id: 'fake-model' };
const brokenModel = { provider: 'broken', id: 'broken-model' };

function completeRows(current: InstallFixture): Array<Record<string, unknown>> {
  return rows(current, "SELECT state, attempts, not_before FROM messages WHERE type = 'kernel.llm.complete' ORDER BY seq DESC");
}

describe('LLM retries, failures, and aborts (ADR 0153)', llmTests, () => {
  it('M2.9-H3 a retryable failure waits the later of the backoff step and retryAfterMs', async () => {
    const current = fixture = await openLlmFixture();
    await installFakeProvider(current, { failures: 2, retryAfterMs: 3000 });
    valueOf(await enable(current, workspaceA, '@kvman/fake-provider'));
    valueOf(await enable(current, workspaceA, '@acme/asker'));
    await waitForFakeModel(current);
    const started = current.timers.time.value;
    const asked = await sendAs(current, person, 'asker.ask', {
      purpose: 'chat', model: fakeModel, live: { text: 'asker.tokens.generated:s1' },
    }, workspaceA);
    await vi.waitFor(() => {
      expect(completeRows(current)).toEqual([{ state: 'pending', attempts: 1, not_before: started + 3_000 }]);
    }, refreshWait);
    current.timers.advance(3_000);
    await vi.waitFor(() => {
      expect(completeRows(current)).toEqual([{ state: 'pending', attempts: 2, not_before: started + 8_000 }]);
    }, refreshWait);
    current.timers.advance(5_000);
    expect(await current.runtime.awaitReply(asked)).toMatchObject({ ok: true, value: { content: 'ok' } });
    // Fake fails before any delta, so the failed attempts published nothing to reset (the scenario row).
    expect(current.live.filter((frame) => frame.run === asked).map((frame) => frame.chunk)).toEqual([{ text: 'ok' }]);
  });

  it('M2.9-E12 each broken mode fails with its code: retryable, invalid, at-once, or unconfigured', async () => {
    const current = fixture = await openLlmFixture();
    valueOf(await enable(current, workspaceA, '@acme/broken'));
    valueOf(await enable(current, workspaceA, '@acme/asker'));
    await vi.waitFor(() => {
      expect(rows(current, "SELECT id FROM llm_models WHERE provider = 'broken'")).toHaveLength(1);
    }, refreshWait);

    valueOf(await command(current, 'kernel.config.set', {
      extension: '@acme/broken', scope: 'global', value: { mode: 'plain' }, revision: 0,
    }));
    const plain = await sendAs(current, person, 'asker.ask', { purpose: 'chat', model: brokenModel, live: { text: 'asker.tokens.generated:p1' } }, workspaceA);
    await vi.waitFor(() => {
      expect(completeRows(current)).toEqual([{ state: 'pending', attempts: 1, not_before: expect.any(Number) }]);
    }, refreshWait);
    current.timers.advance(1_000);
    await vi.waitFor(() => {
      expect(completeRows(current)).toEqual([{ state: 'pending', attempts: 2, not_before: expect.any(Number) }]);
    }, refreshWait);
    current.timers.advance(5_000);
    const plainReply = await current.runtime.awaitReply(plain);
    expect(plainReply.ok).toBe(false);
    if (plainReply.ok) throw new Error('the plain failure was expected to exhaust its retries');
    expect(plainReply.problem.code).toBe('MESSAGE_DEAD');
    expect(plainReply.problem.detail ?? '').toContain('LLM_CALL_FAILED');
    expect(plainReply.problem.detail ?? '').not.toContain('broken cannot complete the request');
    // Each failed attempt's relayed text was reset for its run before the retry (02 §2.3).
    expect(current.live.filter((frame) => frame.run === plain).map((frame) => frame.chunk)).toEqual([
      { text: 'partial' }, { reset: true }, { text: 'partial' }, { reset: true }, { text: 'partial' }, { reset: true },
    ]);

    valueOf(await command(current, 'kernel.config.set', {
      extension: '@acme/broken', scope: 'global', value: { mode: 'invalid' }, revision: 1,
    }));
    const invalid = problemOf(await command(current, 'asker.ask', { purpose: 'chat', model: brokenModel }, person, workspaceA));
    expect(invalid).toMatchObject({ code: 'LLM_CALL_FAILED' });
    expect(invalid.retryable ?? false).toBe(false);
    expect(completeRows(current)[0]).toMatchObject({ state: 'failed', attempts: 0 });

    valueOf(await command(current, 'kernel.config.set', {
      extension: '@acme/broken', scope: 'global', value: { mode: 'overflow' }, revision: 2,
    }));
    expect(problemOf(await command(current, 'asker.ask', { purpose: 'chat', model: brokenModel }, person, workspaceA)))
      .toMatchObject({ code: 'LLM_CONTEXT_OVERFLOW' });
    expect(completeRows(current)[0]).toMatchObject({ state: 'failed', attempts: 0 });

    valueOf(await command(current, 'kernel.config.set', {
      extension: '@acme/broken', scope: 'global', value: { mode: 'unconfigured' }, revision: 3,
    }));
    expect(problemOf(await command(current, 'asker.ask', { purpose: 'chat', model: brokenModel }, person, workspaceA)))
      .toMatchObject({ code: 'LLM_NOT_CONFIGURED' });
    expect(completeRows(current)[0]).toMatchObject({ state: 'failed', attempts: 0 });
  });

  it('M2.9-E13 a deadline and a cancel abort the provider call with no usage row', async () => {
    const current = fixture = await openLlmFixture();
    valueOf(await enable(current, workspaceA, '@acme/slow'));
    valueOf(await enable(current, workspaceA, '@acme/asker'));
    await vi.waitFor(() => {
      expect(rows(current, "SELECT id FROM llm_models WHERE provider = 'slow'")).toHaveLength(1);
    }, refreshWait);

    const pressured = await current.runtime.submitCommand({
      sender: person, idempotencyKey: 'm29-e13-deadline', type: 'asker.ask',
      payload: { purpose: 'chat', model: { provider: 'slow', id: 'slow-model' } },
      workspaceId: workspaceA, deadlineAt: current.timers.time.value + 2_000,
    });
    if (!pressured.ok) throw new Error(`asker.ask was not admitted: ${pressured.problem.code}`);
    await vi.waitFor(() => {
      expect(completeRows(current).map((row) => row['state'])).toEqual(['running']);
    }, refreshWait);
    current.timers.advance(2_000);
    expect(await current.runtime.awaitReply(pressured.id)).toMatchObject({ ok: false, problem: { code: 'DEADLINE_EXCEEDED' } });

    const doomed = await sendAs(current, person, 'asker.ask', {
      purpose: 'chat', model: { provider: 'slow', id: 'slow-model' },
    }, workspaceA);
    await vi.waitFor(() => {
      expect(completeRows(current).map((row) => row['state'])).toEqual(['running', 'failed']);
    }, refreshWait);
    valueOf(await command(current, 'kernel.cancel', { messageId: doomed }, person));
    expect(await current.runtime.awaitReply(doomed)).toMatchObject({ ok: false, problem: { code: 'CANCELLED' } });
    expect(rows(current, 'SELECT message_id FROM llm_usage')).toEqual([]);
  });
});
