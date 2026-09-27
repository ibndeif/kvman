import { existsSync, mkdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { workspaceIdOf } from '@kvman/kernel';
import type { Isolation, JsonObject } from '@kvman/protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyTestPreset } from '../install/fixture-presets.ts';
import { command, person } from '../install/harness.ts';
import { grantsOf, rows, temporaryFolder, valueOf } from '../workspaces/harness.ts';
import {
  ended, gone, objectOf, openProcessesFixture, pidOf, processTests, queried, runAs, sent, spawned, type ProcessesFixture,
} from './harness.ts';

let fixture: ProcessesFixture | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

function codeOf(answer: Record<string, unknown>): unknown {
  return answer['code'] ?? 'ok';
}

describe('ctx.process (plan 03 §3.7, ADR 0139)', () => {
  it('M2.6-E1 spawn and wait return the process result, its joined output, and its log blob', processTests, async () => {
    fixture = await openProcessesFixture();
    process.env['KVMAN_HOME_TEST'] = 'secret';
    try {
      const script = 'printf a; printf b 1>&2; printf c; cat; pwd; echo "$X-$KVMAN_HOME_TEST"';
      const answer = await spawned(fixture, { command: 'sh', args: ['-c', script], stdin: 'in', env: { X: 'x' } }, { wait: true, read: true });
      const log = `abcin${fixture.root}\nx-\n`;
      expect(answer['log']).toBe(log);
      const result = objectOf(answer['result']);
      expect(result).toMatchObject({ exitCode: 0, signal: null, truncated: false, tail: log });
      expect(Number(result['durationMs'])).toBeGreaterThanOrEqual(0);
      const processId = String(answer['processId']);
      expect(rows(fixture, 'SELECT owner, ws FROM blob_refs WHERE ref = ? AND blob_id = ?', `process:${processId}`, String(result['logBlobId']))).toEqual([{ owner: 'kernel', ws: '' }]);
      expect(rows(fixture, 'SELECT mime FROM blobs WHERE id = ?', String(result['logBlobId']))).toEqual([{ mime: 'text/plain' }]);
      expect(existsSync(join(fixture.home, 'jobs', `${processId}.log`))).toBe(false);
    } finally {
      delete process.env['KVMAN_HOME_TEST'];
    }
  });

  it('M2.6-E2 without the process capability, and in a query, spawn and kill are refused', processTests, async () => {
    fixture = await openProcessesFixture();
    const other = realpathSync.native(temporaryFolder('workspace-b'));
    const workspaceB = workspaceIdOf(other);
    applyTestPreset(fixture.connection, { workspaceId: workspaceB, path: other, name: basename(other) });
    fixture.runtime.registry.refresh();
    const granted = grantsOf(fixture, '@acme/runner');
    fixture.enable(workspaceB, '@acme/runner', { ...granted, requested: granted.requested.filter((capability) => capability.name !== 'process') });
    const inB = async (type: string, payload: Record<string, never> | { spawn: { command: string } } | { processId: string }) => objectOf(valueOf(await command(fixture!, type, payload, person, workspaceB)));
    expect(codeOf(await inB('runner.run', { spawn: { command: 'true' } }))).toBe('CAPABILITY_DENIED');
    expect(codeOf(await inB('runner.kill', { processId: '01JABCDEFGHJKMNPQRSTVWXYZ0' }))).toBe('CAPABILITY_DENIED');
    const probed = objectOf(await queried(fixture, 'runner.probe.get', {}));
    expect(objectOf(probed['value'])['code']).toBe('CAPABILITY_DENIED');
    expect(rows(fixture, 'SELECT id FROM processes')).toEqual([]);
  });

  it('M2.6-E3 invalid spawn options fail VALIDATION_FAILED and record nothing', processTests, async () => {
    fixture = await openProcessesFixture();
    const invalid = [
      { command: 'true', detached: true },
      { command: 'true', detached: true, onExit: 'runner.echo' },
      { command: 'true', detached: true, onExit: 'target.ping' },
      { command: 'true', onExit: 'runner.finish' },
      { command: 'true', timeoutMs: 86_400_001 },
      { command: 'true', logCapBytes: 104_857_601 },
    ];
    for (const spawn of invalid) expect(codeOf(await runAs(fixture, 'runner.run', { spawn })), JSON.stringify(spawn)).toBe('VALIDATION_FAILED');
    expect(rows(fixture, 'SELECT id FROM processes')).toEqual([]);
  });

  it('M2.6-E4 the working folder is jailed in the workspace', processTests, async () => {
    fixture = await openProcessesFixture();
    const outside = realpathSync.native(temporaryFolder('outside'));
    mkdirSync(join(fixture.root, 'sub'));
    symlinkSync(outside, join(fixture.root, 'out'));
    writeFileSync(join(fixture.root, 'file.txt'), 'x');
    const printed = async (cwd: string): Promise<unknown> => {
      const answer = await runAs(fixture!, 'runner.run', { spawn: { command: 'pwd', cwd }, wait: true, read: true });
      return 'value' in answer ? objectOf(answer['value'])['log'] : answer['code'];
    };
    expect(await printed('sub')).toBe(`${fixture.root}/sub\n`);
    expect(await printed(join(fixture.root, 'sub'))).toBe(`${fixture.root}/sub\n`);
    for (const cwd of ['..', '/tmp', 'out']) expect(await printed(cwd), cwd).toBe('WORKSPACE_ESCAPE');
    for (const cwd of ['missing', 'file.txt']) expect(await printed(cwd), cwd).toBe('NOT_FOUND');
    const global = async (spawn: { command: string; cwd?: string }): Promise<JsonObject> => objectOf(valueOf(await command(fixture!, 'runner.global.run', { spawn, wait: true, read: true })));
    expect(codeOf(await global({ command: 'pwd' }))).toBe('WORKSPACE_INVALID');
    const outsideAnswer = await global({ command: 'pwd', cwd: outside });
    expect(objectOf(outsideAnswer['value'])['log']).toBe(`${outside}\n`);
  });

  it('M2.6-E5 a missing command exits 127 and names itself in the log', processTests, async () => {
    fixture = await openProcessesFixture();
    const answer = await spawned(fixture, { command: 'kvman-no-such-command' }, { wait: true, read: true });
    expect(objectOf(answer['result'])['exitCode']).toBe(127);
    expect(String(answer['log'])).toContain('kvman-no-such-command');
  });

  it('M2.6-E9 a process that is not detached ends with its invocation', processTests, async () => {
    fixture = await openProcessesFixture();
    const returned = await spawned(fixture, { command: 'sleep', args: ['1000'] });
    const first = String(returned['processId']);
    await gone(pidOf(fixture, first));
    expect(await ended(fixture, first)).toMatchObject({ state: 'killed', reason: 'killed' });

    const holding = await sent(fixture, 'runner.hold', { spawn: { command: 'sleep', args: ['1000'] }, wait: true });
    const second = await vi.waitFor(() => {
      const [row] = rows(fixture!, 'SELECT id FROM processes WHERE id != ?', first);
      if (row === undefined) throw new Error('runner.hold has not spawned yet');
      return String(row['id']);
    }, { timeout: 15_000, interval: 10 });
    fixture.timers.advance(1000);
    const reply = await fixture.runtime.awaitReply(holding);
    expect(reply.ok ? 'ok' : reply.problem.code).toBe('MESSAGE_DEAD');
    await gone(pidOf(fixture, second));
    expect(await ended(fixture, second)).toMatchObject({ state: 'killed', reason: 'killed' });
  });

  it('M2.6-E15 the same sample spawns in every isolation mode', processTests, async () => {
    fixture = await openProcessesFixture();
    const modes: Isolation[] = ['shared', 'dedicated', 'sandboxed'];
    for (const isolation of modes) {
      fixture.enable(fixture.workspaceId, '@acme/runner', grantsOf(fixture, '@acme/runner', isolation));
      const answer = await spawned(fixture, { command: 'echo', args: ['hi'] }, { wait: true, read: true });
      expect(objectOf(answer['result'])['exitCode'], isolation).toBe(0);
      expect(answer['log'], isolation).toBe('hi\n');
    }
  });
});
