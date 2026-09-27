import { afterEach, describe, expect, it } from 'vitest';
import type { JsonObject } from '@kvman/protocol';
import { disable, grantsOf, rows } from '../workspaces/harness.ts';
import { ended, frame, objectOf, openProcessesFixture, processTests, runAs, socketRequest, tokenProcess, type ProcessesFixture } from './harness.ts';

let fixture: ProcessesFixture | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

let keys = 0;

function command(token: string, type: string, payload: JsonObject = {}, extra: JsonObject = {}): string {
  keys += 1;
  return frame(token, { op: 'command', type, payload, idempotencyKey: `socket-${keys}`, ...extra });
}

function codeOf(answer: JsonObject): unknown {
  return answer['ok'] === true ? 'ok' : objectOf(answer['problem'])['code'];
}

describe('job tokens on kernel.sock (plan 12 §12.4, ADR 0140)', () => {
  it('M2.6-H2 a token cannot call a type outside its set or any access-user type', processTests, async () => {
    fixture = await openProcessesFixture();
    const { processId, token } = await tokenProcess(fixture, { calls: ['runner.echo', 'runner.reveal'] });
    const echoed = await socketRequest(fixture.socket, command(token, 'runner.echo', { text: 'hi' }));
    expect(objectOf(objectOf(echoed['data'])['message'])['source']).toBe(`proc:${processId}`);
    expect(codeOf(await socketRequest(fixture.socket, frame(token, { op: 'query', type: 'runner.status.get', payload: {} })))).toBe('CAPABILITY_DENIED');
    expect(codeOf(await socketRequest(fixture.socket, command(token, 'runner.reveal')))).toBe('CALLER_NOT_ALLOWED');
    expect(rows(fixture, "SELECT id FROM messages WHERE type IN ('runner.status.get', 'runner.reveal')")).toEqual([]);
  });

  it('M2.6-E19 an unknown, revoked, or missing token is refused alike', processTests, async () => {
    fixture = await openProcessesFixture();
    const revoked = await tokenProcess(fixture, { calls: ['runner.echo'] });
    expect(await runAs(fixture, 'runner.kill', { processId: revoked.processId })).toEqual({ value: 'killed' });
    await ended(fixture, revoked.processId);
    const answers = [
      await socketRequest(fixture.socket, command('made-up', 'runner.echo', { text: 'x' })),
      await socketRequest(fixture.socket, JSON.stringify({ op: 'command', type: 'runner.echo', payload: { text: 'x' } })),
      await socketRequest(fixture.socket, command(revoked.token, 'runner.echo', { text: 'x' })),
    ];
    for (const answer of answers) expect(objectOf(answer['problem'])).toMatchObject({ code: 'CAPABILITY_DENIED', detail: 'the job token is not valid' });
  });

  it('M2.6-E20 the allowed set is re-evaluated on every call', processTests, async () => {
    fixture = await openProcessesFixture();
    const { token } = await tokenProcess(fixture, { calls: ['target.ping'], delegate: true }, 'delegator.start');
    const ping = (): Promise<JsonObject> => socketRequest(fixture!.socket, command(token, 'target.ping', { text: 'hi' }));
    expect(codeOf(await ping())).toBe('ok');
    const granted = grantsOf(fixture, '@acme/delegator');
    fixture.enable(fixture.workspaceId, '@acme/delegator', { ...granted, requested: [{ name: 'calls', types: ['runner.run', 'target.serve'] }] });
    expect(codeOf(await ping())).toBe('CAPABILITY_DENIED');
    fixture.enable(fixture.workspaceId, '@acme/delegator', granted);
    expect(codeOf(await ping())).toBe('ok');
    expect(await disable(fixture, fixture.workspaceId, '@acme/delegator')).toMatchObject({ ok: true });
    expect(codeOf(await ping())).toBe('CAPABILITY_DENIED');
    expect(rows(fixture, "SELECT count(*) AS count FROM messages WHERE type = 'target.ping'")).toEqual([{ count: 2 }]);
  });

  it('M2.6-E21 a delegated token uses its actor grants', processTests, async () => {
    fixture = await openProcessesFixture();
    const delegated = await tokenProcess(fixture, { calls: ['target.*'], delegate: true }, 'delegator.start');
    expect(codeOf(await socketRequest(fixture.socket, command(delegated.token, 'target.ping', { text: 'hi' })))).toBe('ok');
    expect(codeOf(await socketRequest(fixture.socket, command(delegated.token, 'target.serve')))).toBe('ok');
    expect(codeOf(await socketRequest(fixture.socket, command(delegated.token, 'target.approve')))).toBe('CALLER_NOT_ALLOWED');
    const own = await tokenProcess(fixture, { calls: ['target.*'] });
    expect(codeOf(await socketRequest(fixture.socket, command(own.token, 'target.ping', { text: 'hi' })))).toBe('CAPABILITY_DENIED');
    const fromPerson = await tokenProcess(fixture, { calls: ['runner.*'], delegate: true });
    expect(codeOf(await socketRequest(fixture.socket, command(fromPerson.token, 'runner.echo', { text: 'hi' })))).toBe('ok');
    expect(codeOf(await socketRequest(fixture.socket, command(fromPerson.token, 'runner.serve')))).toBe('CAPABILITY_DENIED');
  });

  it('M2.6-E22 internal types are never allowed to a process', processTests, async () => {
    fixture = await openProcessesFixture();
    const { token } = await tokenProcess(fixture, { calls: ['runner.*'] });
    for (const type of ['runner.record', 'runner.finish']) expect(codeOf(await socketRequest(fixture.socket, command(token, type))), type).toBe('CALLER_NOT_ALLOWED');
  });

  it('M2.6-E23 a kv call is chained under the spawning message', processTests, async () => {
    fixture = await openProcessesFixture();
    const { token } = await tokenProcess(fixture, { calls: ['runner.echo'], context: { sessionId: 's2' } });
    const [spawner] = rows(fixture, "SELECT id, correlation_id FROM messages WHERE type = 'runner.run'");
    const echoed = await socketRequest(fixture.socket, command(token, 'runner.echo', { text: 'hi' }));
    expect(objectOf(objectOf(echoed['data'])['message'])).toMatchObject({
      context: { sessionId: 's2', locale: 'en' }, priority: 'normal', correlationId: spawner?.['correlation_id'], causationId: spawner?.['id'], deadlineAt: null,
      workspaceId: fixture.workspaceId,
    });
    const refused = await runAs(fixture, 'runner.run', { spawn: { command: 'true', token: { calls: ['runner.echo'], context: { locale: 'ar' } } } });
    expect(refused).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('M2.6-E24 commands wait for their reply, keep their idempotency key, and fail with their problem', processTests, async () => {
    fixture = await openProcessesFixture();
    const { token } = await tokenProcess(fixture, { calls: ['runner.*'] });
    const keyed = frame(token, { op: 'command', type: 'runner.echo', payload: { text: 'once' }, idempotencyKey: 'same-key' });
    const first = await socketRequest(fixture.socket, keyed);
    expect(await socketRequest(fixture.socket, keyed)).toEqual(first);
    expect(rows(fixture, "SELECT count(*) AS count FROM messages WHERE type = 'runner.echo'")).toEqual([{ count: 1 }]);
    expect(objectOf((await socketRequest(fixture.socket, command(token, 'runner.defer')))['data'])).toMatchObject({ state: 'awaiting' });
    expect(Object.keys(objectOf((await socketRequest(fixture.socket, command(token, 'runner.echo', { text: 'x' }, { wait: 0 })))['data'])).sort()).toEqual(['id', 'state']);
    expect(codeOf(await socketRequest(fixture.socket, command(token, 'runner.fail')))).toBe('runner/FAILED');
    expect(codeOf(await socketRequest(fixture.socket, frame(token, { op: 'command', type: 'runner.echo', payload: { text: 'x' } })))).toBe('VALIDATION_FAILED');
    expect(await socketRequest(fixture.socket, frame(token, { op: 'query', type: 'runner.status.get', payload: {} }))).toEqual({ ok: true, data: { running: true } });
    expect(codeOf(await socketRequest(fixture.socket, command(token, 'runner.status.get')))).toBe('TYPE_NOT_FOUND');
  });

  it('M2.6-E26 the help op lists and describes what the token may call', processTests, async () => {
    fixture = await openProcessesFixture();
    const { token } = await tokenProcess(fixture, { calls: ['runner.*'] });
    const listed = objectOf((await socketRequest(fixture.socket, frame(token, { op: 'help' })))['data']);
    const types = Array.isArray(listed['types']) ? listed['types'].map((entry) => objectOf(entry)['type']) : [];
    expect(types).toEqual([
      'runner.defer', 'runner.echo', 'runner.exits.list', 'runner.fail', 'runner.global.run', 'runner.hold', 'runner.kill', 'runner.probe.get', 'runner.run', 'runner.serve',
      'runner.status.get',
    ]);
    const described = objectOf((await socketRequest(fixture.socket, frame(token, { op: 'help', type: 'runner.echo' })))['data']);
    expect(described).toMatchObject({ type: 'runner.echo', kind: 'command', description: 'Echoes its text with its message envelope.' });
    expect(String(described['markdown'])).toContain('- `--text <string>` (required)');
    expect(String(described['markdown'])).toContain('    kv runner.echo --text example');
    expect(codeOf(await socketRequest(fixture.socket, frame(token, { op: 'help', type: 'runner.reveal' })))).toBe('CALLER_NOT_ALLOWED');
  });
});
