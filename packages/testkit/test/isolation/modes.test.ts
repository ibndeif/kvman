import { extensionsListResultSchema, replyPayloadSchema, type Json, type ReplyPayload } from '@kvman/protocol';
import { z } from '@kvman/sdk';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eventually, workspaceA, workspaceB } from '../hosts/harness.ts';
import type { InstallFixture } from '../install/harness.ts';
import { enable, grantsOf, query, run, valueOf } from '../workspaces/harness.ts';
import { enableAt, hostOf, isolationTests, openIsolationFixture, workspaceC, type HostIdentity } from './harness.ts';

const identitySchema = z.strictObject({ pid: z.number(), threadId: z.number() });

let fixture: InstallFixture;
beforeEach(async () => {
  fixture = await openIsolationFixture();
});
afterEach(async () => {
  await fixture.close();
});

async function answerOf(asked: Promise<unknown>): Promise<ReplyPayload> {
  return replyPayloadSchema.parse(await asked);
}

async function whoami(workspaceId: string | undefined, type = 'probe.whoami'): Promise<HostIdentity> {
  return identitySchema.parse(valueOf(await run(fixture, type, {}, workspaceId)));
}

describe('isolation modes (plan 03 §3.5, 05 §5.7, ADRs 0128, 0129)', isolationTests, () => {
  it('M2.4-H1 the same sample extension runs in all three isolation modes', async () => {
    enableAt(fixture, workspaceA, '@acme/probe', 'shared');
    enableAt(fixture, workspaceB, '@acme/probe', 'dedicated');
    enableAt(fixture, workspaceC, '@acme/probe', 'sandboxed');
    const expected: Json = { kv: 'x', found: ['x'], logged: ['x'], inner: { echo: 'x' } };
    for (const workspaceId of [workspaceA, workspaceB, workspaceC]) {
      expect(valueOf(await run(fixture, 'probe.work', { text: 'x' }, workspaceId))).toEqual(expected);
      await eventually(async () => expect(await query(fixture, 'probe.count', {}, undefined, workspaceId)).toEqual({ ok: true, value: 1 }));
    }
    const [shared, dedicated, sandboxed] = [await whoami(workspaceA), await whoami(workspaceB), await whoami(workspaceC)];
    expect(hostOf(fixture, shared)).toMatchObject({ isolation: 'shared', extension: undefined });
    expect(hostOf(fixture, dedicated)).toMatchObject({ isolation: 'dedicated', extension: '@acme/probe' });
    expect(hostOf(fixture, sandboxed)).toMatchObject({ isolation: 'sandboxed', extension: '@acme/probe' });
    expect([shared.pid, dedicated.pid]).toEqual([process.pid, process.pid]);
    expect(dedicated.threadId).not.toBe(shared.threadId);
    expect(sandboxed.pid).not.toBe(process.pid);
    expect(fixture.runtime.hosts.hosts().map(({ isolation, extension }) => `${isolation} ${extension ?? '*'}`).sort())
      .toEqual(['dedicated @acme/probe', 'sandboxed @acme/probe', 'shared *']);
  });

  it('M2.4-E2 enabling with a raised isolation succeeds', async () => {
    const reply = await enable(fixture, workspaceA, '@acme/probe', grantsOf(fixture, '@acme/probe', 'dedicated'));
    expect(reply).toEqual({ ok: true, value: { revision: 2 } });
    const listed = extensionsListResultSchema.parse(valueOf(await answerOf(query(fixture, 'kernel.extensions.list', {}))));
    expect(listed.find((entry) => entry.name === '@acme/probe')?.isolation).toEqual({ [workspaceA]: 'dedicated' });
  });

  it('M2.4-E3 one extension at two levels runs in two hosts', async () => {
    enableAt(fixture, workspaceA, '@acme/probe', 'sandboxed');
    enableAt(fixture, workspaceB, '@acme/probe', 'shared');
    expect((await whoami(workspaceA)).pid).not.toBe(process.pid);
    expect((await whoami(workspaceB)).pid).toBe(process.pid);
  });

  it('M2.4-E4 a global invocation runs at the most isolated level of its workspaces', async () => {
    enableAt(fixture, workspaceA, '@acme/probe', 'shared');
    enableAt(fixture, workspaceB, '@acme/probe', 'sandboxed');
    const global = await whoami(undefined, 'probe.global.ping');
    expect(global.pid).not.toBe(process.pid);
    expect(hostOf(fixture, global)).toMatchObject({ isolation: 'sandboxed' });
  });

  it('M2.4-E5 a new isolation applies to the next message', async () => {
    enableAt(fixture, workspaceA, '@acme/probe', 'shared');
    expect((await whoami(workspaceA)).pid).toBe(process.pid);
    enableAt(fixture, workspaceA, '@acme/probe', 'sandboxed');
    expect((await whoami(workspaceA)).pid).not.toBe(process.pid);
  });
});
