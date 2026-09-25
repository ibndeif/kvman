import { sseMessageSchemas } from '@kvman/protocol';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bootFixture, type DaemonFixture } from '../daemon/harness.ts';
import { eventually, workerTests, workspaceA, workspaceB } from '../hosts/harness.ts';
import { command, openStream, problemOf, send, type HttpAnswer, type OpenStream, type SseMessage } from './http-client.ts';

let fixture: DaemonFixture;
beforeEach(async () => {
  fixture = await bootFixture();
});
afterEach(async () => {
  await fixture.close();
});

type Subscription = { sid: string; events?: string[]; live?: string[]; workspaceId?: string; since?: number };

function subscribe(stream: string, subscription: Subscription): Promise<HttpAnswer> {
  return send(fixture.port, 'POST', '/api/v1/subscriptions', { body: { stream, ...subscription } });
}

async function connect(stream: string, headers: Record<string, string> = {}, query = ''): Promise<OpenStream> {
  const opened = await openStream(fixture.port, `/api/v1/events?stream=${stream}${query}`, headers);
  await opened.waitFor((messages) => expect(messages[0]?.event).toBe('hello'));
  return opened;
}

// The server has seen the connection end once a subscription for the stream is refused as not connected.
async function disconnect(opened: OpenStream, stream: string, subscription: Subscription): Promise<void> {
  opened.close();
  await eventually(async () => expect((await subscribe(stream, subscription)).status).toBe(404));
}

async function addNote(workspaceId = workspaceA): Promise<number> {
  expect((await command(fixture.port, 'notes.add', { text: 'x' }, { workspaceId })).status).toBe(200);
  return newestSeq();
}

function newestSeq(): number {
  return Number(fixture.kernel.connection.prepare('SELECT MAX(seq) AS seq FROM events').get()?.['seq'] ?? 0);
}

function eventRow(seq: number): Record<string, unknown> | undefined {
  return fixture.kernel.connection.prepare('SELECT * FROM events WHERE seq = ?').get(seq);
}

function eventsFor(opened: OpenStream, sid: string): SseMessage[] {
  return opened.named('event').filter((message) => typeof message.data === 'object' && message.data !== null && 'sid' in message.data && message.data.sid === sid);
}

// A transient touch on a marker subscription shows that everything sent before it has arrived.
async function marker(opened: OpenStream, stream: string): Promise<void> {
  expect((await subscribe(stream, { sid: 'marker', events: ['notes.touched'] })).status).toBe(201);
  expect((await command(fixture.port, 'notes.touch', { id: 'marker', step: 1 })).status).toBe(200);
  await opened.waitFor(() => expect(eventsFor(opened, 'marker')).toHaveLength(1));
}

describe('the event stream (plan 12 §12.3, ADRs 0027, 0098)', workerTests, () => {
  it('M1.8-H6 a reconnect with Last-Event-ID replays missed events', async () => {
    const first = await connect('S');
    expect((await subscribe('S', { sid: 'n', events: ['notes.*'] })).status).toBe(201);
    const seq1 = await addNote();
    await first.waitFor(() => expect(eventsFor(first, 'n').map((message) => message.id)).toEqual([String(seq1)]));
    await disconnect(first, 'S', { sid: 'n', events: ['notes.*'] });
    const seq2 = await addNote();
    const seq3 = await addNote();
    const again = await connect('S', { 'last-event-id': String(seq1) });
    expect(again.messages[0]?.data).toMatchObject({ subscriptions: ['n'] });
    await again.waitFor(() => expect(eventsFor(again, 'n').map((message) => message.id)).toEqual([String(seq2), String(seq3)]));
    expect(eventsFor(again, 'n').map((message) => message.data)).toEqual([seq2, seq3].map((seq) => expect.objectContaining({ sid: 'n', seq })));
    again.close();
  });

  it('M1.8-E50 hello comes first', async () => {
    const seq = await addNote();
    const opened = await connect('S');
    expect(opened.raw().startsWith('retry: 1000\n\n')).toBe(true);
    expect(opened.messages[0]?.data).toEqual({
      userId: 'local', cursor: seq, protocolVersion: 1, kernelVersion: fixture.kernel.identity.version, subscriptions: [],
      notifications: { unread: 0, attention: 0 },
    });
    opened.close();
  });

  it('M1.8-E51 a ping every 20 s', async () => {
    const opened = await connect('S');
    fixture.timers.advance(20_000);
    fixture.timers.advance(20_000);
    await opened.waitFor((messages) => expect(messages.filter((message) => message.comment === 'ping')).toHaveLength(2));
    opened.close();
  });

  it('M1.8-E52 durable events carry their seq as id; transient ones carry the cursor without id', async () => {
    const opened = await connect('S');
    expect((await subscribe('S', { sid: 'n', events: ['notes.*'] })).status).toBe(201);
    const seq = await addNote();
    expect((await command(fixture.port, 'notes.touch', { id: 't', step: 1 })).status).toBe(200);
    await opened.waitFor(() => expect(eventsFor(opened, 'n')).toHaveLength(2));
    const [durable, transient] = eventsFor(opened, 'n');
    const row = eventRow(seq);
    expect(durable?.id).toBe(String(seq));
    expect(durable?.data).toEqual({
      sid: 'n', seq, event: {
        id: row?.['id'], type: 'notes.added', source: 'ext:@acme/notes', workspaceId: workspaceA, payload: JSON.parse(String(row?.['payload'])),
        correlationId: row?.['correlation_id'], causationId: row?.['causation_id'], createdAt: row?.['created_at'],
      },
    });
    expect(transient?.id).toBeUndefined();
    expect(transient?.data).toMatchObject({ sid: 'n', seq, event: { type: 'notes.touched', payload: { id: 't', step: 1 } } });
    opened.close();
  });

  it("M1.8-E53 a subscription's workspace selects its events and global ones", async () => {
    fixture.kernel.connection.prepare('INSERT INTO workspaces (id, path, name, created_at) VALUES (?, ?, ?, ?)').run(workspaceB, '/w/b', 'B', 1);
    const scoped = await connect('S');
    const everything = await connect('T');
    for (const subscription of [{ sid: 'ns', events: ['notes.*'] }, { sid: 'ks', events: ['kernel.*'] }, { sid: 'dup', events: ['notes.added'] }]) {
      expect((await subscribe('S', { ...subscription, workspaceId: workspaceA })).status).toBe(201);
    }
    expect((await subscribe('T', { sid: 'all', events: ['notes.*', 'kernel.*'] })).status).toBe(201);
    await addNote(workspaceA);
    await addNote(workspaceB);
    const quarantined = await fixture.kernel.runtime.pipeline.enqueue({
      origin: { kind: 'quarantine', extension: '@acme/drift', reason: 'HOST_FAILURES', correlationId: '01JAZ3K4M5N6P7Q8R9S0T1V2W3' },
      writes: [], sends: [], replies: [], publishes: [{ type: 'kernel.extension.quarantined', payload: { name: '@acme/drift', reason: 'HOST_FAILURES' } }],
    });
    expect(quarantined.committed).toBe(true);
    await everything.waitFor(() => expect(eventsFor(everything, 'all')).toHaveLength(3));
    await marker(scoped, 'S');
    const workspaceOf = (message: SseMessage): string | undefined => sseMessageSchemas.event.parse(message.data).event.workspaceId;
    const typed = (message: SseMessage): [string, string | undefined] => [sseMessageSchemas.event.parse(message.data).event.type, workspaceOf(message)];
    expect(eventsFor(scoped, 'ns').map(typed)).toEqual([['notes.added', workspaceA], ['notes.touched', workspaceA]]);
    expect(eventsFor(scoped, 'dup').map(workspaceOf)).toEqual([workspaceA]);
    expect(eventsFor(scoped, 'ks').map((message) => message.data)).toEqual([expect.objectContaining({ event: expect.objectContaining({ type: 'kernel.extension.quarantined' }) })]);
    expect(eventsFor(everything, 'all').map(typed).slice(0, 3)).toEqual([['notes.added', workspaceA], ['notes.added', workspaceB], ['kernel.extension.quarantined', undefined]]);
    scoped.close();
    everything.close();
  });

  it('M1.8-E54 a live subscription receives the ring, then new chunks', async () => {
    expect((await command(fixture.port, 'notes.chunks', { key: 'k', texts: ['a', 'b', 'c'] })).status).toBe(200);
    const opened = await connect('S');
    expect((await subscribe('S', { sid: 'l', live: ['notes.text.streamed:k'], workspaceId: workspaceA })).status).toBe(201);
    expect((await command(fixture.port, 'notes.chunks', { key: 'k', texts: ['d'] })).status).toBe(200);
    await opened.waitFor(() => expect(opened.named('live')).toHaveLength(4));
    const chunks = opened.named('live').map((message) => message.data);
    expect(chunks).toEqual(['a', 'b', 'c', 'd'].map((text, index) => ({ sid: 'l', type: 'notes.text.streamed', key: 'k', run: expect.any(String), n: index + 1, chunk: { text } })));
    opened.close();
  });

  it('M1.8-E55 since replays after a cursor', async () => {
    const seq1 = await addNote();
    const seq2 = await addNote();
    const seq3 = await addNote();
    const opened = await connect('S');
    expect((await subscribe('S', { sid: 'n', events: ['notes.*'], since: seq1 })).status).toBe(201);
    await opened.waitFor(() => expect(eventsFor(opened, 'n').map((message) => message.id)).toEqual([String(seq2), String(seq3)]));
    opened.close();
  });

  it('M1.8-E56 ?lastEventId= resumes like the header', async () => {
    const first = await connect('S');
    expect((await subscribe('S', { sid: 'n', events: ['notes.*'] })).status).toBe(201);
    const seq1 = await addNote();
    await first.waitFor(() => expect(eventsFor(first, 'n')).toHaveLength(1));
    await disconnect(first, 'S', { sid: 'n', events: ['notes.*'] });
    const seq2 = await addNote();
    const again = await connect('S', {}, `&lastEventId=${seq1}`);
    await again.waitFor(() => expect(eventsFor(again, 'n').map((message) => message.id)).toEqual([String(seq2)]));
    again.close();
  });

  it('M1.8-E57 subscriptions survive a disconnect for 5 minutes', async () => {
    const kept = await connect('S');
    expect((await subscribe('S', { sid: 'x', events: ['notes.*'] })).status).toBe(201);
    await disconnect(kept, 'S', { sid: 'x', events: ['notes.*'] });
    fixture.timers.advance(4 * 60_000);
    const back = await connect('S');
    expect(back.messages[0]?.data).toMatchObject({ subscriptions: ['x'] });
    back.close();

    const expired = await connect('T');
    expect((await subscribe('T', { sid: 'old', events: ['notes.*'] })).status).toBe(201);
    await disconnect(expired, 'T', { sid: 'old', events: ['notes.*'] });
    fixture.timers.advance(5 * 60_000);
    const later = await connect('T');
    expect(later.messages[0]?.data).toMatchObject({ subscriptions: [] });
    await addNote();
    await marker(later, 'T');
    expect(eventsFor(later, 'old')).toEqual([]);
    later.close();
  });

  it('M1.8-E58 an unknown cursor gets resync cursor-unknown', async () => {
    const first = await connect('S');
    expect((await subscribe('S', { sid: 'x', events: ['notes.*'] })).status).toBe(201);
    await disconnect(first, 'S', { sid: 'x', events: ['notes.*'] });
    const again = await connect('S', { 'last-event-id': String(newestSeq() + 100) });
    expect(again.messages[0]?.data).toMatchObject({ subscriptions: [] });
    await again.waitFor(() => expect(again.named('resync').map((message) => message.data)).toEqual([{ reason: 'cursor-unknown' }]));
    fixture.timers.advance(20_000);
    await again.waitFor((messages) => expect(messages.some((message) => message.comment === 'ping')).toBe(true));
    expect(again.named('event')).toEqual([]);
    again.close();
  });

  it('M1.8-E59 an expired cursor gets resync cursor-expired', async () => {
    for (let note = 0; note < 4; note += 1) await addNote();
    const newest = newestSeq();
    fixture.kernel.connection.prepare('DELETE FROM events WHERE seq < ?').run(newest);
    const opened = await connect('S');
    expect((await subscribe('S', { sid: 'x', events: ['notes.*'], since: newest - 3 })).status).toBe(201);
    await opened.waitFor(() => expect(opened.named('resync').map((message) => message.data)).toEqual([{ reason: 'cursor-expired' }]));
    await addNote();
    await marker(opened, 'S');
    expect(eventsFor(opened, 'x')).toEqual([]);
    opened.close();
  });

  it('M1.8-E60 the newest connection of a stream wins', async () => {
    const first = await connect('S');
    const second = await connect('S');
    await first.ended;
    expect(first.messages.map((message) => message.event)).toEqual(['hello']);
    expect((await subscribe('S', { sid: 'x', events: ['notes.*'] })).status).toBe(201);
    await addNote();
    await second.waitFor(() => expect(eventsFor(second, 'x')).toHaveLength(1));
    second.close();
  });

  it('M1.8-E61 subscribing needs an open connection; unsubscribing is idempotent', async () => {
    const nobody = await subscribe('nobody', { sid: 'x', events: ['notes.*'] });
    expect([nobody.status, problemOf(nobody).code]).toEqual([404, 'NOT_FOUND']);
    const opened = await connect('S');
    expect((await send(fixture.port, 'DELETE', '/api/v1/subscriptions/unknown?stream=S')).status).toBe(204);
    expect((await subscribe('S', { sid: 'x', events: ['notes.*'] })).status).toBe(201);
    await addNote();
    await opened.waitFor(() => expect(eventsFor(opened, 'x')).toHaveLength(1));
    expect((await send(fixture.port, 'DELETE', '/api/v1/subscriptions/x?stream=S')).status).toBe(204);
    await addNote();
    await marker(opened, 'S');
    expect(eventsFor(opened, 'x')).toHaveLength(1);
    opened.close();
  });

  it('M1.8-E62 an invalid subscription is refused', async () => {
    const opened = await connect('S');
    for (const subscription of [{ sid: 'x', events: ['Notes.*'] }, { sid: 'y', live: ['notes.text.streamed'] }]) {
      const refused = await subscribe('S', subscription);
      expect([refused.status, problemOf(refused).code]).toEqual([400, 'VALIDATION_FAILED']);
    }
    opened.close();
  });
});
