import { healthResultSchema } from '@kvman/protocol';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bootFixture, type DaemonFixture } from '../daemon/harness.ts';
import { workerTests } from '../hosts/harness.ts';
import { problemOf, send } from './http-client.ts';

let fixture: DaemonFixture;
beforeEach(async () => {
  fixture = await bootFixture();
});
afterEach(async () => {
  await fixture.close();
});

async function health(): Promise<ReturnType<typeof healthResultSchema.parse>> {
  const answer = await send(fixture.port, 'GET', '/api/v1/health');
  expect(answer.status).toBe(200);
  return healthResultSchema.parse(answer.json);
}

describe('health (plan 03 §3.8, ADRs 0092, 0099)', workerTests, () => {
  it('M1.8-E28 health is also the kernel.health.get query', async () => {
    const { identity } = fixture.kernel;
    expect(await health()).toEqual({
      status: 'ok', version: identity.version, instanceId: identity.instanceId, processStart: identity.processStart, uptimeMs: 0, port: fixture.port,
      home: fixture.home,
    });
    fixture.timers.advance(1500);
    const answer = await send(fixture.port, 'POST', '/api/v1/queries/kernel.health.get', { body: { payload: {} } });
    expect(answer.status).toBe(200);
    expect(answer.json).toEqual({ data: { ...(await health()), uptimeMs: 1500 } });
  });

  it('M1.8-E29 health is degraded while an extension is quarantined', async () => {
    expect((await health()).status).toBe('ok');
    fixture.kernel.connection.prepare("UPDATE extensions SET status = 'quarantined', quarantine_reason = 'HOST_FAILURES' WHERE name = '@acme/counter'").run();
    expect((await health()).status).toBe('degraded');
  });

  it('M1.8-E69 kernel types need no workspace', async () => {
    expect((await send(fixture.port, 'POST', '/api/v1/queries/kernel.health.get', { body: { payload: {} } })).status).toBe(200);
    const cancel = await send(fixture.port, 'POST', '/api/v1/commands/kernel.cancel', { body: { payload: { messageId: '01JAZ3K4M5N6P7Q8R9S0T1V2W3' }, idempotencyKey: 'e69' } });
    expect([cancel.status, cancel.json]).toEqual([200, { id: expect.any(String), reply: { cancelled: 0 } }]);
    const extension = await send(fixture.port, 'POST', '/api/v1/queries/counter.total.get', { body: { payload: {} } });
    expect([extension.status, problemOf(extension).code]).toEqual([422, 'WORKSPACE_INVALID']);
  });
});
