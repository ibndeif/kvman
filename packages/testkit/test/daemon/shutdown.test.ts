import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { betterSqlite3Driver, openReadConnection, type LiveFrame } from '@kvman/kernel';
import { commandReplyResponseSchema } from '@kvman/protocol';
import { describe, expect, it } from 'vitest';
import { command, openStream, problemOf, send } from '../adapters/http-client.ts';
import { eventually, ManualTimers, workerTests, workspaceA } from '../hosts/harness.ts';
import { bootFixture, type DaemonFixture } from './harness.ts';

function stateRow(fixture: DaemonFixture, type: string): Record<string, unknown> | undefined {
  return fixture.kernel.connection.prepare('SELECT * FROM messages WHERE type = ? ORDER BY seq').get(type);
}

// After shutdown the kernel's connection is closed; the file is read again.
function storedRow(home: string, id: unknown): Record<string, unknown> | undefined {
  const connection = openReadConnection(join(home, 'kvman.db'), betterSqlite3Driver);
  const found = connection.prepare('SELECT * FROM messages WHERE id = ?').get(String(id));
  connection.close();
  return found;
}

describe('shutdown (plan 03 §3.9, ADRs 0090, 0091)', workerTests, () => {
  it('M1.8-E70 kernel.shutdown answers {} and then shuts the kernel down', async () => {
    const fixture = await bootFixture();
    const answer = await command(fixture.port, 'kernel.shutdown', {});
    expect(answer.status).toBe(200);
    const { id, reply } = commandReplyResponseSchema.parse(answer.json);
    expect(reply).toEqual({});
    await fixture.kernel.shutdown();
    expect(existsSync(join(fixture.home, 'daemon.lock'))).toBe(false);
    expect(storedRow(fixture.home, id)).toMatchObject({ state: 'done', result: JSON.stringify({ ok: true, value: {} }) });
  });

  it('M1.8-E23 an invocation that finishes within 10 s commits', async () => {
    const fixture = await bootFixture();
    expect((await command(fixture.port, 'notes.nap', { ms: 200 }, { wait: 0 })).status).toBe(202);
    await eventually(() => expect(stateRow(fixture, 'notes.nap')?.['state']).toBe('running'));
    const id = stateRow(fixture, 'notes.nap')?.['id'];
    await fixture.kernel.shutdown();
    expect(storedRow(fixture.home, id)).toMatchObject({ state: 'done', result: JSON.stringify({ ok: true, value: { slept: 200 } }) });
  });

  it('M1.8-E24 an invocation still running after 10 s returns to pending without an attempt', async () => {
    const fixture = await bootFixture();
    const frames: LiveFrame[] = [];
    fixture.kernel.runtime.live.subscribe((frame) => frames.push(frame));
    expect((await command(fixture.port, 'notes.cancel.probe', {}, { wait: 0 })).status).toBe(202);
    await eventually(() => expect(frames).toHaveLength(1));
    const id = stateRow(fixture, 'notes.cancel.probe')?.['id'];
    const stopping = fixture.kernel.shutdown();
    fixture.timers.advance(10_000);
    await stopping;
    expect(frames.map((frame) => [frame.run, frame.chunk])).toEqual([[id, { text: 'partial' }], [id, { reset: true }]]);
    expect(storedRow(fixture.home, id)).toMatchObject({ state: 'pending', attempts: 0 });
    const timers = new ManualTimers();
    timers.time.value = fixture.timers.time.value;
    const next = await bootFixture({ home: fixture.home, timers });
    await eventually(() => expect(stateRow(next, 'notes.cancel.probe')).toMatchObject({ state: 'running', attempts: 0 }));
    await next.close();
  });

  it('M1.8-E25 a request during shutdown gets KERNEL_STOPPING; /health still answers', async () => {
    const fixture = await bootFixture();
    expect((await command(fixture.port, 'notes.edit.slow', { id: 'e25' }, { wait: 0 })).status).toBe(202);
    await eventually(() => expect(stateRow(fixture, 'notes.edit.slow')?.['state']).toBe('running'));
    const stopping = fixture.kernel.shutdown();
    const refused = [
      await command(fixture.port, 'notes.add', { text: 'x' }),
      await send(fixture.port, 'POST', '/api/v1/queries/counter.total.get', { body: { payload: {}, workspaceId: workspaceA } }),
      await send(fixture.port, 'POST', '/api/v1/subscriptions', { body: { stream: 'S', sid: 'x', events: ['notes.*'] } }),
    ];
    for (const answer of refused) expect([answer.status, problemOf(answer)]).toEqual([503, expect.objectContaining({ code: 'KERNEL_STOPPING', retryable: true })]);
    expect((await send(fixture.port, 'GET', '/api/v1/health')).status).toBe(200);
    fixture.timers.advance(10_000);
    await stopping;
  });

  it('M1.8-E26 a request waiting for a reply answers 202 at close, and streams get close shutdown', async () => {
    const fixture = await bootFixture();
    const stream = await openStream(fixture.port, '/api/v1/events?stream=S');
    await stream.waitFor((messages) => expect(messages[0]?.event).toBe('hello'));
    const waiting = command(fixture.port, 'notes.relay', { id: 'e26' });
    await eventually(() => expect(stateRow(fixture, 'notes.ask')?.['state']).toBe('awaiting'));
    const id = stateRow(fixture, 'notes.relay')?.['id'];
    const stopping = fixture.kernel.shutdown();
    fixture.timers.advance(10_000);
    const answer = await waiting;
    expect([answer.status, answer.json]).toEqual([202, { id, state: 'pending' }]);
    await stream.ended;
    expect(stream.named('close').map((message) => message.data)).toEqual([{ reason: 'shutdown' }]);
    await stopping;
  });

  it('M1.8-E27 kernel.shutdown is for people only', async () => {
    const fixture = await bootFixture();
    const answer = await command(fixture.port, 'notes.shutdown.try', {});
    expect([answer.status, answer.json]).toEqual([200, { id: stateRow(fixture, 'notes.shutdown.try')?.['id'], reply: { code: 'CALLER_NOT_ALLOWED' } }]);
    expect((await send(fixture.port, 'GET', '/api/v1/health')).status).toBe(200);
    await fixture.close();
  });
});
