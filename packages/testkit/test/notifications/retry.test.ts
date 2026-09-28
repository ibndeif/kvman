import { afterEach, describe, expect, it } from 'vitest';
import { eventually, workspaceA } from '../hosts/harness.ts';
import { command, person, problemOf, sendAs } from '../install/harness.ts';
import { query, rows, valueOf } from '../workspaces/harness.ts';
import { deadAfterBackoff, failId, stateOf } from './dead-letters.ts';
import { heraldCall, notificationTests, openNotificationFixture, type NotificationFixture } from './harness.ts';

let current: NotificationFixture | undefined;

afterEach(async () => {
  await current?.close();
  current = undefined;
});

async function opened(): Promise<NotificationFixture> {
  current = await openNotificationFixture();
  return current;
}

function retry(fixture: NotificationFixture, messageId: string): ReturnType<typeof command> {
  return command(fixture.fixture, 'kernel.message.retry', { messageId });
}

function resultOf(fixture: NotificationFixture, messageId: string): unknown {
  const [row] = rows(fixture.fixture, 'SELECT result, on_reply, not_before FROM messages WHERE id = ?', messageId);
  return row;
}

describe('kernel.message.retry (ADR 0164)', notificationTests, () => {
  it('M2.12-E45 retrying a dead message runs it again with its attempts reset', async () => {
    const fixture = await opened();
    await sendAs(fixture.fixture, person, 'herald.fail', {}, workspaceA);
    const messageId = failId(fixture.fixture);
    await deadAfterBackoff(fixture.fixture, messageId);
    valueOf(await command(fixture.fixture, 'herald.heal', {}, person, workspaceA));
    expect(await retry(fixture, messageId)).toEqual({ ok: true, value: {} });
    await eventually(() => expect(stateOf(fixture.fixture, messageId)).toEqual({ state: 'done', attempts: 0 }));
    expect(resultOf(fixture, messageId)).toMatchObject({ result: '{"ok":true,"value":{"ran":true}}' });
  });

  it('M2.12-E46 a retried dead message with a continuation does not deliver a second one', async () => {
    const fixture = await opened();
    valueOf(await command(fixture.fixture, 'herald.fail-later', {}, person, workspaceA));
    await eventually(() => expect(rows(fixture.fixture, "SELECT id FROM messages WHERE type = 'herald.fail'")).toHaveLength(1));
    const messageId = failId(fixture.fixture);
    await deadAfterBackoff(fixture.fixture, messageId);
    const once = { ok: true, value: { replies: [{ reply: { ok: false, problem: { code: 'MESSAGE_DEAD' } } }] } };
    await eventually(async () => expect(await query(fixture.fixture, 'herald.state.get', {}, person, workspaceA)).toMatchObject(once));
    valueOf(await command(fixture.fixture, 'herald.heal', {}, person, workspaceA));
    valueOf(await retry(fixture, messageId));
    await eventually(() => expect(stateOf(fixture.fixture, messageId).state).toBe('done'));
    expect(resultOf(fixture, messageId)).toMatchObject({ on_reply: null });
    const answer = await query(fixture.fixture, 'herald.state.get', {}, person, workspaceA);
    expect(answer).toMatchObject(once);
    expect(answer).toMatchObject({ value: { replies: [expect.anything()] } });
    expect(rows(fixture.fixture, "SELECT COUNT(*) AS continuations FROM messages WHERE type = 'herald.replied'")).toEqual([{ continuations: 1 }]);
  });

  it('M2.12-E47 retrying a pending message waiting out its backoff runs it at once', async () => {
    const fixture = await opened();
    await sendAs(fixture.fixture, person, 'herald.fail', {}, workspaceA);
    const messageId = failId(fixture.fixture);
    await eventually(() => expect(stateOf(fixture.fixture, messageId)).toEqual({ state: 'pending', attempts: 1 }));
    valueOf(await command(fixture.fixture, 'herald.heal', {}, person, workspaceA));
    valueOf(await retry(fixture, messageId));
    await eventually(() => expect(stateOf(fixture.fixture, messageId).state).toBe('done'));
  });

  it('M2.12-E48 a done message, an unknown id, and a non-administrator are refused', async () => {
    const fixture = await opened();
    await sendAs(fixture.fixture, person, 'herald.heal', {}, workspaceA);
    const [done] = rows(fixture.fixture, "SELECT id FROM messages WHERE type = 'herald.heal'");
    await eventually(() => expect(stateOf(fixture.fixture, String(done?.['id'])).state).toBe('done'));
    const refused = problemOf(await retry(fixture, String(done?.['id'])));
    expect(refused).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(refused.detail).toContain('done');
    expect(problemOf(await retry(fixture, '01JAZ3K4M5N6P7Q8R9S0T1V2W3')).code).toBe('NOT_FOUND');
    expect(await heraldCall(fixture, 'kernel.message.retry', { messageId: String(done?.['id']) }, 'command')).toEqual({ ok: true, value: { code: 'CAPABILITY_DENIED' } });
  });
});
