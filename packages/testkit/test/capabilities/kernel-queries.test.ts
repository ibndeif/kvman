import { join } from 'node:path';
import type { Sender } from '@kvman/kernel';
import { messagesListResultSchema, replyPayloadSchema, type Json, type ReplyPayload } from '@kvman/protocol';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eventually, workspaceA, workspaceB } from '../hosts/harness.ts';
import { person, type InstallFixture } from '../install/harness.ts';
import { query, run, start, valueOf } from '../workspaces/harness.ts';
import { enableAt, enableWithGrant, isolationTests, openIsolationFixture, workspaceC } from '../isolation/harness.ts';

let fixture: InstallFixture;
beforeEach(async () => {
  fixture = await openIsolationFixture();
});
afterEach(async () => {
  await fixture.close();
});

const wardenProcess: Sender = { address: 'proc:01JAZ3K4M5N6P7Q8R9S0T1V2W3', extension: '@acme/warden' };

async function asked(type: string, payload: Json, sender: Sender = person, workspaceId?: string): Promise<ReplyPayload> {
  return replyPayloadSchema.parse(await query(fixture, type, payload, sender, workspaceId));
}

function codeOf(reply: ReplyPayload): string {
  return reply.ok ? 'ok' : reply.problem.code;
}

async function listed(payload: Json): Promise<ReturnType<typeof messagesListResultSchema.parse>> {
  return messagesListResultSchema.parse(valueOf(await asked('kernel.messages.list', payload)));
}

describe('kernel.messages.list and kernel.subscribers.list (plan 03 §3.8, ADRs 0132, 0133)', isolationTests, () => {
  it('M2.4-E25 an admin query answers only administrators', async () => {
    enableAt(fixture, workspaceA, '@acme/warden', 'shared');
    enableAt(fixture, workspaceA, '@acme/intruder', 'shared');
    expect(codeOf(await asked('kernel.messages.list', {}))).toBe('ok');
    expect(valueOf(await run(fixture, 'warden.ask', { type: 'kernel.messages.list', payload: {} }))).toMatchObject({ result: { total: expect.any(Number) } });
    expect(valueOf(await run(fixture, 'intruder.try', { surface: 'messages' }))).toEqual({ code: 'CAPABILITY_DENIED' });
    expect(codeOf(await asked('kernel.messages.list', {}, wardenProcess, workspaceA))).toBe('CAPABILITY_DENIED');
  });

  it('M2.4-E26 kernel.messages.list filters, orders, and limits without payloads', async () => {
    enableAt(fixture, workspaceA, '@acme/probe', 'shared');
    for (let index = 0; index < 250; index += 1) await start(fixture, 'probe.whoami', {}, workspaceA);
    await eventually(async () => expect((await listed({ type: 'probe.whoami', state: 'done' })).total).toBe(250));
    enableAt(fixture, workspaceB, '@acme/probe', 'shared');
    const delayed = await fixture.runtime.submitCommand({ sender: person, idempotencyKey: 'delayed', type: 'probe.whoami', payload: {}, workspaceId: workspaceB, delayMs: 60_000 });
    if (!delayed.ok) throw new Error(delayed.problem.code);
    const pending = delayed.id;
    enableAt(fixture, workspaceC, '@acme/probe', 'sandboxed');
    const failed = await start(fixture, 'probe.read', { path: join(fixture.home, 'kvman.db'), caught: false }, workspaceC);
    await eventually(async () => expect((await listed({ state: 'failed' })).items.map((item) => item.id)).toContain(failed));
    const all = await listed({});
    expect(all.items).toHaveLength(200);
    expect(all.total).toBe(Number(fixture.connection.prepare('SELECT count(*) AS total FROM messages').get()?.['total']));
    expect(all.items.map((item) => item.createdAt)).toEqual([...all.items.map((item) => item.createdAt)].sort((left, right) => right - left));
    expect(all.items.every((item) => !('payload' in item) && !('result' in item))).toBe(true);
    expect((await listed({ state: 'pending' })).items.map((item) => item.id)).toEqual([pending]);
    expect((await listed({ workspaceId: workspaceB })).items.map((item) => item.id)).toEqual([pending]);
    expect((await listed({ type: 'probe.read' })).items.map((item) => item.id)).toEqual([failed]);
    expect((await listed({ extension: '@acme/probe' })).total).toBe(252);
    const [first] = (await listed({ type: 'probe.read' })).items;
    expect((await listed({ correlationId: first?.correlationId ?? '' })).items.map((item) => item.id)).toEqual([failed]);
    expect((await listed({ limit: 5 })).items.map((item) => item.id)).toEqual(all.items.slice(0, 5).map((item) => item.id));
    expect(codeOf(await asked('kernel.messages.list', { limit: 1001 }))).toBe('VALIDATION_FAILED');
  });

  it('M2.4-E27 kernel.subscribers.list lists who would receive an event', async () => {
    for (const name of ['@acme/probe', '@acme/listener', '@acme/bystander']) enableAt(fixture, workspaceA, name, 'shared');
    const subscribers = async (type: string): Promise<Json> => valueOf(await asked('kernel.subscribers.list', { workspaceId: workspaceA, type }));
    const listener = { name: '@acme/listener', namespace: 'listener', title: 'Listener', status: 'active', calls: ['probe.count'] };
    const probe = { name: '@acme/probe', namespace: 'probe', title: 'Probe', status: 'active', calls: [] };
    expect(await subscribers('probe.worked')).toEqual([listener, probe]);
    expect(await subscribers('kernel.extension.enabled')).toEqual([listener]);
    fixture.connection.prepare("UPDATE extensions SET status = 'quarantined', quarantine_reason = 'HOST_FAILURES' WHERE name = '@acme/listener'").run();
    fixture.runtime.registry.refresh();
    expect(await subscribers('probe.worked')).toEqual([{ ...listener, status: 'quarantined' }, probe]);
    enableWithGrant(fixture, workspaceA, '@acme/listener', (grants) => ({ ...grants, derived: { ...grants.derived, subscribes: [] } }));
    expect(await subscribers('probe.worked')).toEqual([probe]);
  });

  it('M2.4-E28 kernel.subscribers.list refuses bad requests and answers empty for unknown types', async () => {
    enableAt(fixture, workspaceA, '@acme/probe', 'shared');
    expect(codeOf(await asked('kernel.subscribers.list', { workspaceId: 'f'.repeat(64), type: 'probe.worked' }))).toBe('WORKSPACE_INVALID');
    expect(codeOf(await asked('kernel.subscribers.list', { workspaceId: workspaceA, type: 'probe.*' }))).toBe('VALIDATION_FAILED');
    expect(await asked('kernel.subscribers.list', { workspaceId: workspaceA, type: 'nobody.registers.this' })).toEqual({ ok: true, value: [] });
    expect(await asked('kernel.subscribers.list', { workspaceId: workspaceA, type: 'probe.progress' })).toEqual({ ok: true, value: [] });
  });
});
