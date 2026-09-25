import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bootFixture, type DaemonFixture } from '../daemon/harness.ts';
import { workerTests, workspaceA } from '../hosts/harness.ts';
import { openStream, problemOf, send, type HttpAnswer, type RequestOptions } from './http-client.ts';

let fixture: DaemonFixture;
beforeEach(async () => {
  fixture = await bootFixture();
});
afterEach(async () => {
  await fixture.close();
});

let keys = 0;

function cancel(options: RequestOptions = {}): Promise<HttpAnswer> {
  keys += 1;
  const body = { payload: { messageId: '01JAZ3K4M5N6P7Q8R9S0T1V2W3' }, idempotencyKey: `edge-${keys}`, workspaceId: workspaceA };
  return send(fixture.port, 'POST', '/api/v1/commands/kernel.cancel', { body, ...options });
}

function refused(answer: HttpAnswer): [number, string] {
  return [answer.status, problemOf(answer).code];
}

function cancelRows(): number {
  return Number(fixture.kernel.connection.prepare("SELECT COUNT(*) AS count FROM messages WHERE type = 'kernel.cancel'").get()?.['count']);
}

describe('browser security at the edge (plan 12 §12.3, §12.8, 13 §13.8)', workerTests, () => {
  it('M1.8-H7 a request with a foreign Host gets 403', async () => {
    const host = `evil.example:${fixture.port}`;
    expect(refused(await send(fixture.port, 'GET', '/api/v1/health', { host }))).toEqual([403, 'HOST_FORBIDDEN']);
    expect(refused(await cancel({ host }))).toEqual([403, 'HOST_FORBIDDEN']);
    expect(refused(await send(fixture.port, 'GET', '/api/v1/events?stream=S', { host }))).toEqual([403, 'HOST_FORBIDDEN']);
    expect(cancelRows()).toBe(0);
  });

  it('M1.8-E44 an unknown route answers 404 NOT_FOUND', async () => {
    expect(refused(await send(fixture.port, 'GET', '/api/v1/nothing'))).toEqual([404, 'NOT_FOUND']);
    expect(refused(await send(fixture.port, 'GET', '/api/v2/health'))).toEqual([404, 'NOT_FOUND']);
  });

  it('M1.8-E45 only the served Host values pass', async () => {
    expect((await send(fixture.port, 'GET', '/api/v1/health', { host: `127.0.0.1:${fixture.port}` })).status).toBe(200);
    expect((await send(fixture.port, 'GET', '/api/v1/health', { host: `localhost:${fixture.port}` })).status).toBe(200);
    for (const host of [`127.0.0.1:${fixture.port + 1}`, 'evil.example', '']) {
      expect(refused(await send(fixture.port, 'GET', '/api/v1/health', { host }))).toEqual([403, 'HOST_FORBIDDEN']);
    }
  });

  it('M1.8-E46 Origin must be a served origin when present', async () => {
    for (const origin of [`http://127.0.0.1:${fixture.port}`, `http://localhost:${fixture.port}`]) {
      expect((await cancel({ headers: { origin } })).status).toBe(200);
    }
    for (const origin of [`http://127.0.0.1:${fixture.port + 1}`, 'null', 'https://evil.example']) {
      expect(refused(await cancel({ headers: { origin } }))).toEqual([403, 'HOST_FORBIDDEN']);
    }
    const origin = 'https://evil.example';
    const subscription = await send(fixture.port, 'POST', '/api/v1/subscriptions', { body: { stream: 'S', sid: 'a', events: ['notes.*'] }, headers: { origin } });
    expect(refused(subscription)).toEqual([403, 'HOST_FORBIDDEN']);
    expect(refused(await send(fixture.port, 'DELETE', '/api/v1/subscriptions/a?stream=S', { headers: { origin } }))).toEqual([403, 'HOST_FORBIDDEN']);
    expect(cancelRows()).toBe(2);
  });

  it('M1.8-E47 Sec-Fetch-Site must be same-origin, or none for a GET', async () => {
    for (const site of ['cross-site', 'same-site', 'none']) {
      expect(refused(await cancel({ headers: { 'sec-fetch-site': site } }))).toEqual([403, 'HOST_FORBIDDEN']);
    }
    expect((await cancel({ headers: { 'sec-fetch-site': 'same-origin' } })).status).toBe(200);
    expect((await send(fixture.port, 'GET', '/api/v1/health', { headers: { 'sec-fetch-site': 'none' } })).status).toBe(200);
  });

  it('M1.8-E48 the event stream accepts only same-origin fetches', async () => {
    for (const site of ['none', 'cross-site']) {
      expect(refused(await send(fixture.port, 'GET', '/api/v1/events?stream=S', { headers: { 'sec-fetch-site': site } }))).toEqual([403, 'HOST_FORBIDDEN']);
    }
    for (const headers of [{ 'sec-fetch-site': 'same-origin' }, {}]) {
      const stream = await openStream(fixture.port, '/api/v1/events?stream=S', headers);
      expect(stream.status).toBe(200);
      await stream.waitFor((messages) => expect(messages[0]?.event).toBe('hello'));
      stream.close();
    }
  });

  it('M1.8-E49 no CORS allowances', async () => {
    const preflight = await send(fixture.port, 'OPTIONS', '/api/v1/commands/kernel.cancel', { headers: { 'access-control-request-method': 'POST' } });
    const answers = [await send(fixture.port, 'GET', '/api/v1/health', { headers: { origin: 'https://evil.example' } }), preflight, await cancel()];
    for (const answer of answers) expect(Object.keys(answer.headers).filter((name) => name.startsWith('access-control-'))).toEqual([]);
    expect(refused(preflight)).toEqual([404, 'NOT_FOUND']);
  });
});
