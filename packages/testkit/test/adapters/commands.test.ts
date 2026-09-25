import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bootFixture, type DaemonFixture } from '../daemon/harness.ts';
import { eventually, workerTests } from '../hosts/harness.ts';
import { command, openStream, problemOf, send, type OpenStream } from './http-client.ts';

let fixture: DaemonFixture;
beforeEach(async () => {
  fixture = await bootFixture();
});
afterEach(async () => {
  await fixture.close();
});

function messages(type: string): Array<Record<string, unknown>> {
  return fixture.kernel.connection.prepare('SELECT * FROM messages WHERE type = ? ORDER BY seq').all(type);
}

function stateOf(type: string, index = 0): unknown {
  return messages(type)[index]?.['state'];
}

const tab = { 'x-kvman-stream': 'S', 'x-kvman-client': 'C' };

async function connected(stream = 'S'): Promise<OpenStream> {
  const opened = await openStream(fixture.port, `/api/v1/events?stream=${stream}`);
  await opened.waitFor((received) => expect(received.map((message) => message.event)).toContain('hello'));
  return opened;
}

// notes.relay runs while its notes.ask waits; the POST's wait passes on the kernel clock and it answers 202.
async function relayAccepted(id: string, headers: Record<string, string>): Promise<string> {
  const posting = command(fixture.port, 'notes.relay', { id }, { wait: 1000 }, headers);
  await eventually(() => expect(stateOf('notes.ask')).toBe('awaiting'));
  fixture.timers.advance(1000);
  const answer = await posting;
  expect(answer.status).toBe(202);
  expect(answer.json).toEqual({ id: messages('notes.relay')[0]?.['id'], state: 'running' });
  return String(messages('notes.relay')[0]?.['id']);
}

async function answerQuestion(answer: string): Promise<void> {
  const askId = String(messages('notes.ask')[0]?.['id']);
  expect((await command(fixture.port, 'notes.question.answer', { askId, answer })).status).toBe(200);
}

describe('HTTP commands (plan 12 §12.2–§12.3, ADR 0094)', workerTests, () => {
  it('M1.8-H5 a command still running after wait answers 202 and its reply arrives on the stream', async () => {
    const stream = await connected();
    const id = await relayAccepted('h5', tab);
    await answerQuestion('yes');
    await stream.waitFor(() => expect(stream.named('reply')).toHaveLength(1));
    expect(stream.named('reply')[0]?.data).toEqual({ clientId: 'C', id, ok: true, data: { answer: 'yes' } });
    stream.close();
  });

  it('M1.8-E30 a command answers its value in the same response', async () => {
    const answer = await command(fixture.port, 'notes.add', { text: 'x' });
    expect(answer.status).toBe(200);
    expect(answer.json).toEqual({ id: messages('notes.add')[0]?.['id'], reply: { id: expect.any(String) } });
  });

  it('M1.8-E31 a failed reply answers its Problem with the status of its code', async () => {
    const answer = await command(fixture.port, 'counter.fail', {});
    expect(answer.status).toBe(422);
    expect(problemOf(answer)).toMatchObject({ code: 'counter/NEGATIVE', params: { by: -1 }, messageId: messages('counter.fail')[0]?.['id'] });
  });

  it('M1.8-E33 admission refusals use the same table', async () => {
    const unknown = await command(fixture.port, 'notes.unknown', {});
    expect([unknown.status, problemOf(unknown).code]).toEqual([404, 'TYPE_NOT_FOUND']);
    const invalid = await command(fixture.port, 'notes.add', { text: 5 });
    expect([invalid.status, problemOf(invalid).code]).toEqual([400, 'VALIDATION_FAILED']);
    expect(problemOf(invalid).issues?.length).toBeGreaterThan(0);
    const internal = await command(fixture.port, 'counter.secret', {});
    expect([internal.status, problemOf(internal).code]).toEqual([403, 'CALLER_NOT_ALLOWED']);
  });

  it('M1.8-E34 a deferred command answers 202 at once', async () => {
    const answer = await command(fixture.port, 'notes.ask', { id: 'e34' });
    expect(answer.status).toBe(202);
    expect(answer.json).toEqual({ id: messages('notes.ask')[0]?.['id'], state: 'awaiting' });
  });

  it('M1.8-E35 wait: 0 answers 202 at once; wait over 60 s is refused', async () => {
    const at = await command(fixture.port, 'notes.add', { text: 'x' }, { wait: 0 });
    expect(at.status).toBe(202);
    expect(at.json).toEqual({ id: messages('notes.add')[0]?.['id'], state: 'pending' });
    const over = await command(fixture.port, 'notes.edit.slow', { id: 'e35' }, { wait: 60_001 });
    expect([over.status, problemOf(over).code]).toEqual([400, 'VALIDATION_FAILED']);
    expect(messages('notes.edit.slow')).toHaveLength(0);
  });

  it('M1.8-E36 the same idempotency key returns the original; another digest conflicts', async () => {
    const body = { payload: { text: 'once' }, idempotencyKey: 'same', workspaceId: 'a'.repeat(64) };
    const first = await send(fixture.port, 'POST', '/api/v1/commands/notes.add', { body });
    const again = await send(fixture.port, 'POST', '/api/v1/commands/notes.add', { body });
    expect(again.json).toEqual(first.json);
    expect(messages('notes.add')).toHaveLength(1);
    const other = await send(fixture.port, 'POST', '/api/v1/commands/notes.add', { body: { ...body, payload: { text: 'twice' } } });
    expect([other.status, problemOf(other).code]).toEqual([409, 'IDEMPOTENCY_MISMATCH']);
  });

  it('M1.8-E37 X-Kvman-Client names the source; a bad header is refused', async () => {
    expect((await command(fixture.port, 'notes.add', { text: 'x' }, {}, { 'x-kvman-client': 'tab-1' })).status).toBe(200);
    expect(messages('notes.add')[0]?.['source']).toBe('user:local/client:tab-1');
    const bad = await command(fixture.port, 'notes.add', { text: 'x' }, {}, { 'x-kvman-client': 'a/b' });
    expect([bad.status, problemOf(bad).code]).toEqual([400, 'VALIDATION_FAILED']);
  });

  it('M1.8-E38 bodies are JSON, validated, and bounded', async () => {
    const path = '/api/v1/commands/notes.add';
    const withoutType = await send(fixture.port, 'POST', path, { rawBody: '{"payload":{"text":"x"},"idempotencyKey":"k"}' });
    expect([withoutType.status, problemOf(withoutType).code]).toEqual([400, 'VALIDATION_FAILED']);
    const unparsable = await send(fixture.port, 'POST', path, { rawBody: '{"payload":', headers: { 'content-type': 'application/json' } });
    expect([unparsable.status, problemOf(unparsable).code]).toEqual([400, 'VALIDATION_FAILED']);
    const unknownField = await send(fixture.port, 'POST', path, { body: { payload: { text: 'x' }, idempotencyKey: 'k', extra: 1 } });
    expect([unknownField.status, problemOf(unknownField).code]).toEqual([400, 'VALIDATION_FAILED']);
    const tooLarge = await send(fixture.port, 'POST', path, { rawBody: `{"payload":"${'x'.repeat(17 * 1024 * 1024)}"}`, headers: { 'content-type': 'application/json' } });
    expect(tooLarge.status).toBe(413);
    expect(problemOf(tooLarge)).toMatchObject({ code: 'PAYLOAD_TOO_LARGE', params: { limit: 'payload', max: 16_777_216 } });
    expect(messages('notes.add')).toHaveLength(0);
  });

  it('M1.8-E39 a reply goes to exactly one place', async () => {
    const stream = await connected();
    expect((await send(fixture.port, 'POST', '/api/v1/subscriptions', { body: { stream: 'S', sid: 'marker', events: ['notes.touched'] } })).status).toBe(201);
    expect((await command(fixture.port, 'notes.add', { text: 'x' }, {}, tab)).status).toBe(200);
    expect((await command(fixture.port, 'notes.touch', { id: 'marker', step: 1 })).status).toBe(200);
    await stream.waitFor(() => expect(stream.named('event')).toHaveLength(1));
    expect(stream.named('reply')).toEqual([]);
    stream.close();
  });

  it('M1.8-E40 a late failure reaches the stream as a problem reply', async () => {
    const stream = await connected();
    const id = await relayAccepted('e40', tab);
    expect((await command(fixture.port, 'kernel.cancel', { messageId: id })).json).toMatchObject({ reply: { cancelled: 2 } });
    await stream.waitFor(() => expect(stream.named('reply')).toHaveLength(1));
    expect(stream.named('reply')[0]?.data).toMatchObject({ clientId: 'C', id, ok: false, problem: { code: 'CANCELLED' } });
    stream.close();
  });

  it('M1.8-E41 a late reply for a stream that is not connected is dropped', async () => {
    const first = await connected();
    const id = await relayAccepted('e41', tab);
    first.close();
    await first.ended;
    await answerQuestion('late');
    await eventually(() => expect(stateOf('notes.relay')).toBe('done'));
    const again = await connected();
    expect(again.named('reply')).toEqual([]);
    const status = await send(fixture.port, 'GET', `/api/v1/messages/${id}`);
    expect(status.json).toEqual({ id, type: 'notes.relay', state: 'done', reply: { answer: 'late' } });
    again.close();
  });
});
