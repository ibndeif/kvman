import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eventually, workspaceA } from '../hosts/harness.ts';
import type { InstallFixture } from '../install/harness.ts';
import { rows, run, start, valueOf } from '../workspaces/harness.ts';
import { enableAt, isolationTests, openIsolationFixture, processExited } from './harness.ts';

let fixture: InstallFixture;
beforeEach(async () => {
  fixture = await openIsolationFixture();
  enableAt(fixture, workspaceA, '@acme/probe', 'sandboxed');
});
afterEach(async () => {
  await fixture.close();
});

function stateOf(id: string): Record<string, unknown> {
  const [row] = rows(fixture, 'SELECT state, attempts FROM messages WHERE id = ?', id);
  return row ?? {};
}

function sandboxPid(): number | undefined {
  return fixture.runtime.hosts.hosts().find((host) => host.isolation === 'sandboxed')?.worker.thread.identity.pid;
}

// A crash is retried after the first backoff, which the kernel's clock gives (03 §3.4).
async function crashedOnce(id: string): Promise<void> {
  await eventually(() => expect(stateOf(id)).toEqual({ state: 'pending', attempts: 1 }));
  fixture.timers.advance(1_000);
}

function quarantined(): boolean {
  return rows(fixture, "SELECT name FROM extensions WHERE status = 'quarantined'").length > 0;
}

// Two more first-attempt crashes: the third charge within 10 minutes quarantines Probe (03 §3.6).
async function twoMoreCrashes(): Promise<void> {
  for (let crash = 0; crash < 2; crash += 1) await crashedOnce(await start(fixture, 'probe.exit'));
}

describe('supervising sandboxed hosts (plan 03 §3.5, §3.6, ADRs 0067, 0082, 0129, 0130)', isolationTests, () => {
  it('M2.4-E12 a sandboxed host that exits is a host crash', async () => {
    await run(fixture, 'probe.whoami');
    const first = sandboxPid();
    const id = await start(fixture, 'probe.exit');
    await crashedOnce(id);
    expect(await fixture.runtime.awaitReply(id)).toEqual({ ok: true, value: { survived: true } });
    expect(stateOf(id)).toEqual({ state: 'done', attempts: 1 });
    expect(sandboxPid()).not.toBe(first);
    await twoMoreCrashes();
    await eventually(() => expect(quarantined()).toBe(true));
  });

  it('M2.4-E13 a stuck sandboxed handler gets its process killed', async () => {
    const hold = await start(fixture, 'probe.hold');
    await eventually(() => expect(rows(fixture, "SELECT state FROM steps WHERE message_id = ? AND name = 'hold'", hold)).toEqual([{ state: 'done' }]));
    const first = sandboxPid();
    const hang = await start(fixture, 'probe.hang');
    await eventually(() => expect(stateOf(hang)).toMatchObject({ state: 'running' }));
    fixture.timers.advance(1_000);
    await eventually(() => expect(stateOf(hang)).toEqual({ state: 'dead', attempts: 1 }));
    fixture.timers.advance(2_000);
    expect(await fixture.runtime.awaitReply(hold)).toEqual({ ok: true, value: { held: false } });
    expect(stateOf(hold)).toEqual({ state: 'done', attempts: 0 });
    expect(first === undefined ? false : processExited(first)).toBe(true);
    expect(sandboxPid()).not.toBe(first);
    await twoMoreCrashes();
    await eventually(() => expect(quarantined()).toBe(true));
  });

  it('M2.4-E14 an invalid frame from a sandboxed host ends it', async () => {
    await run(fixture, 'probe.whoami');
    const first = sandboxPid();
    const id = await start(fixture, 'probe.forge');
    await crashedOnce(id);
    expect(fixture.logged).toContainEqual(expect.objectContaining({ level: 'warn', message: expect.stringMatching(/^host sandboxed:@acme\/probe:\d+ sent an invalid frame$/) }));
    expect(await fixture.runtime.awaitReply(id)).toEqual({ ok: true, value: { forged: false } });
    expect(first === undefined ? false : processExited(first)).toBe(true);
    expect(sandboxPid()).not.toBe(first);
    await twoMoreCrashes();
    await eventually(() => expect(quarantined()).toBe(true));
  });

  it('M2.4-E17 an idle sandboxed process exits and a later message starts a new one', async () => {
    const first = valueOf(await run(fixture, 'probe.whoami'));
    const pid = sandboxPid();
    fixture.timers.advance(10 * 60_000);
    expect(fixture.runtime.hosts.hosts()).toEqual([]);
    await eventually(() => expect(pid === undefined ? false : processExited(pid)).toBe(true));
    const second = valueOf(await run(fixture, 'probe.whoami'));
    expect(second).not.toEqual(first);
    await twoMoreCrashes();
    expect(quarantined()).toBe(false);
  });
});
