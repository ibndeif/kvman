import { describe, expect, it } from 'vitest';
import { complete, fail, openSchedulerFixture, restart, row, submit, workspaceA, type SchedulerFixture } from './harness.ts';

function attemptsOf(fixture: SchedulerFixture, messageId: string): number[] {
  return fixture.dispatcher.claims.filter((claim) => claim.message.id === messageId).map((claim) => claim.attempt);
}

function events(fixture: SchedulerFixture): Array<Record<string, unknown>> {
  return fixture.connection.prepare("SELECT * FROM events WHERE type = 'kernel.message.dead-lettered'").all();
}

function reply(fixture: SchedulerFixture, messageId: string): unknown {
  return JSON.parse(String(row(fixture, messageId)['result']));
}

describe('retries and dead letters (plan 03 §3.4, 02 §2.12, ADRs 0059, 0061, 0062)', () => {
  it('M1.5-H3 retries follow 1 s, 5 s, 30 s and end dead with kernel.message.dead-lettered', async () => {
    const fixture = openSchedulerFixture();
    const id = await submit(fixture, 'pdf.convert');
    for (const [attempt, backoff] of [[1, 1_000], [2, 5_000], [3, 30_000]] as const) {
      await fail(fixture, id);
      expect(row(fixture, id)).toMatchObject({ state: 'pending', attempts: attempt, not_before: fixture.time.value + backoff });
      fixture.timers.advance(backoff - 1);
      expect(attemptsOf(fixture, id)).toHaveLength(attempt);
      fixture.timers.advance(1);
      expect(attemptsOf(fixture, id)).toHaveLength(attempt + 1);
    }
    await fail(fixture, id);
    expect(attemptsOf(fixture, id)).toEqual([1, 2, 3, 4]);
    expect(row(fixture, id)).toMatchObject({ state: 'dead', attempts: 4 });
    expect(reply(fixture, id)).toMatchObject({ ok: false, problem: { code: 'MESSAGE_DEAD', messageId: id } });
    const [announced] = events(fixture);
    expect(JSON.parse(String(announced?.['payload']))).toEqual({ messageId: id, type: 'pdf.convert', correlationId: id });
    const delivery = fixture.connection.prepare('SELECT * FROM messages WHERE causation_id = ?').get(String(announced?.['id']));
    expect(delivery).toMatchObject({ handler: '@acme/audit|subscription:kernel.message.dead-lettered', workspace_id: workspaceA });
  });

  it('M1.5-E16 without maxAttempts a message dies on its third failure', async () => {
    const fixture = openSchedulerFixture();
    const id = await submit(fixture, 'pdf.render');
    await fail(fixture, id);
    expect(row(fixture, id)['not_before']).toBe(fixture.time.value + 1_000);
    fixture.timers.advance(1_000);
    await fail(fixture, id);
    expect(row(fixture, id)['not_before']).toBe(fixture.time.value + 5_000);
    fixture.timers.advance(5_000);
    await fail(fixture, id);
    expect(row(fixture, id)).toMatchObject({ state: 'dead', attempts: 3 });
    expect(attemptsOf(fixture, id)).toEqual([1, 2, 3]);
  });

  it('M1.5-E17 a retrying message keeps its lane until it has run again', async () => {
    const fixture = openSchedulerFixture();
    const retried = await submit(fixture, 'pdf.translate', { fileId: 'f1' });
    const later = await submit(fixture, 'pdf.translate', { fileId: 'f1' });
    await fail(fixture, retried);
    expect(fixture.dispatcher.claimedIds()).toEqual([retried]);
    fixture.timers.advance(1_000);
    expect(fixture.dispatcher.claimedIds()).toEqual([retried, retried]);
    await complete(fixture, retried);
    expect(fixture.dispatcher.claimedIds()).toEqual([retried, retried, later]);
  });

  it('M1.5-E18 storage conflicts rerun at once five times per attempt; the sixth counts', async () => {
    const fixture = openSchedulerFixture();
    const id = await submit(fixture, 'pdf.render');
    for (let rerun = 0; rerun < 5; rerun += 1) expect(await fixture.scheduler.conflicted(id)).toEqual({ rerun: true });
    expect(attemptsOf(fixture, id)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(row(fixture, id)).toMatchObject({ state: 'running', attempts: 0 });
    fixture.dispatcher.end(id);
    const sixth = await fixture.scheduler.conflicted(id);
    expect(sixth).toMatchObject({ rerun: false, result: { committed: true } });
    expect(row(fixture, id)).toMatchObject({ state: 'pending', attempts: 1, not_before: fixture.time.value + 1_000 });
    fixture.timers.advance(1_000);
    expect(await fixture.scheduler.conflicted(id)).toEqual({ rerun: true });
    expect(attemptsOf(fixture, id)).toEqual([1, 1, 1, 1, 1, 1, 2, 2]);
  });

  it('M1.5-E19 a dead message stores MESSAGE_DEAD and announces itself in its own workspace', async () => {
    const fixture = openSchedulerFixture();
    const cause = await submit(fixture, 'pdf.render');
    const result = await complete(fixture, cause, { ok: true, value: null }, { sends: [{ type: 'pdf.render', payload: {} }] });
    const id = result.committed ? result.inserted[0]?.message.id ?? '' : '';
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await fail(fixture, id);
      fixture.timers.advance(5_000);
    }
    expect(reply(fixture, id)).toMatchObject({ problem: { code: 'MESSAGE_DEAD', detail: 'the last of 3 attempts failed with INTERNAL', correlationId: cause } });
    expect(events(fixture)[0]).toMatchObject({ source: 'kernel', correlation_id: cause, causation_id: id, workspace_id: workspaceA });

    const global = await submit(fixture, 'pdf.index.rebuild');
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await fail(fixture, global);
      fixture.timers.advance(5_000);
    }
    expect(events(fixture)[1]).toMatchObject({ causation_id: global, workspace_id: null });
  });

  it('M1.5-E20 a rebuilt scheduler keeps a lane behind a message waiting for its retry', async () => {
    const fixture = openSchedulerFixture();
    const retried = await submit(fixture, 'pdf.translate', { fileId: 'f1' });
    const later = await submit(fixture, 'pdf.translate', { fileId: 'f1' });
    await fail(fixture, retried);
    const restarted = restart(fixture);
    expect(restarted.dispatcher.claimedIds()).toEqual([]);
    restarted.timers.advance(1_000);
    expect(restarted.dispatcher.claimedIds()).toEqual([retried]);
    expect(restarted.dispatcher.claims[0]?.attempt).toBe(2);
    await complete(restarted, retried);
    expect(restarted.dispatcher.claimedIds()).toEqual([retried, later]);
  });
});
