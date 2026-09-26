import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { workspaceA, workspaceB } from '../hosts/harness.ts';
import { problemOf, type InstallFixture } from '../install/harness.ts';
import { rows, run, temporaryFolder, valueOf } from '../workspaces/harness.ts';
import { enableAt, isolationTests, openIsolationFixture } from './harness.ts';

let fixture: InstallFixture;
beforeEach(async () => {
  fixture = await openIsolationFixture();
});
afterEach(async () => {
  await fixture.close();
});

// The stored rows of a type: a message failed on its first attempt has no retry counted.
function endingsOf(type: string): Array<Record<string, unknown>> {
  return rows(fixture, 'SELECT state, attempts FROM messages WHERE type = ?', type);
}

describe('the sandboxed host (plan 03 §3.5, 05 §5.7, 06 §6.2, ADRs 0002, 0129)', isolationTests, () => {
  it('M2.4-H3 a sandboxed extension cannot read a file outside its access or load node:sqlite', async () => {
    enableAt(fixture, workspaceA, '@acme/probe', 'sandboxed');
    enableAt(fixture, workspaceB, '@acme/probe', 'shared');
    const database = join(fixture.home, 'kvman.db');
    expect(valueOf(await run(fixture, 'probe.read', { path: database, caught: true }, workspaceA))).toEqual({ code: 'ERR_ACCESS_DENIED' });
    expect(valueOf(await run(fixture, 'probe.sqlite', {}, workspaceA))).toEqual({
      imported: { code: 'ERR_UNKNOWN_BUILTIN_MODULE' }, required: { code: 'ERR_UNKNOWN_BUILTIN_MODULE' }, builtin: 'undefined',
    });
    expect(valueOf(await run(fixture, 'probe.read', { path: database, caught: true }, workspaceB))).toEqual({ result: 'SQLite format 3' });
  });

  it('M2.4-E7 a granted capability never widens the sandbox', async () => {
    enableAt(fixture, workspaceA, '@acme/probe', 'sandboxed');
    const file = join(temporaryFolder('workspace'), 'notes.md');
    writeFileSync(file, 'notes');
    expect(valueOf(await run(fixture, 'probe.spawn', { caught: true }, workspaceA))).toEqual({ code: 'ERR_ACCESS_DENIED' });
    expect(valueOf(await run(fixture, 'probe.read', { path: file, caught: true }, workspaceA))).toEqual({ code: 'ERR_ACCESS_DENIED' });
  });

  it('M2.4-E8 a blocked operation that ends a handler fails CAPABILITY_DENIED', async () => {
    enableAt(fixture, workspaceA, '@acme/probe', 'sandboxed');
    const database = join(fixture.home, 'kvman.db');
    const read = problemOf(await run(fixture, 'probe.read', { path: database, caught: false }, workspaceA));
    const spawned = problemOf(await run(fixture, 'probe.spawn', { caught: false }, workspaceA));
    expect([read.code, spawned.code]).toEqual(['CAPABILITY_DENIED', 'CAPABILITY_DENIED']);
    expect(read.detail).toContain('a file read');
    expect(spawned.detail).toContain('a child process');
    expect(`${read.detail ?? ''} ${read.hint ?? ''}`).not.toContain(database);
    expect([...endingsOf('probe.read'), ...endingsOf('probe.spawn')]).toEqual([{ state: 'failed', attempts: 0 }, { state: 'failed', attempts: 0 }]);
  });

  it('M2.4-E9 a native addon in a sandboxed host fails CAPABILITY_DENIED', async () => {
    enableAt(fixture, workspaceA, '@acme/probe', 'sandboxed');
    const problem = problemOf(await run(fixture, 'probe.addon', {}, workspaceA));
    expect(problem.code).toBe('CAPABILITY_DENIED');
    expect(problem.detail).toContain('a native addon');
  });

  it('M2.4-E10 a sandboxed host sees an empty environment', async () => {
    process.env['KVMAN_TEST_TOKEN'] = 'not for extensions';
    try {
      enableAt(fixture, workspaceA, '@acme/probe', 'sandboxed');
      expect(valueOf(await run(fixture, 'probe.env', {}, workspaceA))).toEqual({ names: [] });
    } finally {
      delete process.env['KVMAN_TEST_TOKEN'];
    }
  });

  it('M2.4-E11 output written by a sandboxed extension does not reach the frame pipe', async () => {
    enableAt(fixture, workspaceA, '@acme/probe', 'sandboxed');
    expect(valueOf(await run(fixture, 'probe.noise', {}, workspaceA))).toEqual({});
    const [host] = fixture.runtime.hosts.hosts();
    expect(valueOf(await run(fixture, 'probe.whoami', {}, workspaceA))).toMatchObject({ pid: host?.worker.thread.identity.pid });
    expect(fixture.runtime.hosts.hosts()).toHaveLength(1);
  });
});
