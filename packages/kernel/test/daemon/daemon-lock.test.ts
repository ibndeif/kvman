import { execFileSync } from 'node:child_process';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { daemonLockSchema, type DaemonLock } from '@kvman/protocol';
import { describe, expect, it } from 'vitest';
import { acquireDaemonLock, processStartOf, ProblemError, readDaemonLock, releaseDaemonLock } from '../../src/index.ts';
import { ids, temporaryFolder } from './boot.ts';

function record(overrides: Partial<DaemonLock> = {}): DaemonLock {
  return { pid: process.pid, processStart: processStartOf(process.pid) ?? '', nonce: crypto.randomUUID(), port: 4190, startedAt: Date.now(), ...overrides };
}

function codeOf(run: () => void): string {
  try {
    run();
  } catch (error) {
    if (error instanceof ProblemError) return error.problem.code;
    throw error;
  }
  return 'acquired';
}

function lockText(home: string): string {
  return readFileSync(join(home, 'daemon.lock'), 'utf8');
}

describe('the daemon lock (plan 03 §3.10, ADR 0088)', () => {
  it('M1.8-E8 the lock record', () => {
    const home = temporaryFolder();
    const mine = record();
    acquireDaemonLock(home, mine, ids.next());
    expect(daemonLockSchema.parse(JSON.parse(lockText(home)))).toEqual(mine);
    expect(statSync(join(home, 'daemon.lock')).mode & 0o777).toBe(0o600);
    const ps = execFileSync('ps', ['-o', 'lstart=', '-p', String(process.pid)], { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } });
    expect(mine.processStart).toBe(ps.trim().replace(/\s+/g, ' '));
    expect(mine.nonce).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('M1.8-E9 a live owner is a conflict, whether or not it answers', () => {
    const home = temporaryFolder();
    const owner = record({ port: 4199 });
    acquireDaemonLock(home, owner, ids.next());
    const before = lockText(home);
    expect(codeOf(() => acquireDaemonLock(home, record(), ids.next()))).toBe('DAEMON_CONFLICT');
    expect(lockText(home)).toBe(before);
  });

  it('M1.8-E10 a reused PID with another start time is stale, like an exited one', () => {
    const exitedHome = temporaryFolder();
    const exited = Number(execFileSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' }));
    writeFileSync(join(exitedHome, 'daemon.lock'), JSON.stringify(record({ pid: exited })));
    expect(codeOf(() => acquireDaemonLock(exitedHome, record(), ids.next()))).toBe('acquired');

    const home = temporaryFolder();
    writeFileSync(join(home, 'daemon.lock'), JSON.stringify(record({ processStart: 'Mon Jan 1 00:00:00 2024' })));
    const mine = record();
    expect(codeOf(() => acquireDaemonLock(home, mine, ids.next()))).toBe('acquired');
    expect(readDaemonLock(home)).toEqual(mine);
  });

  it('M1.8-E11 a lock that does not parse is stale', () => {
    const home = temporaryFolder();
    writeFileSync(join(home, 'daemon.lock'), 'not json');
    const mine = record();
    expect(codeOf(() => acquireDaemonLock(home, mine, ids.next()))).toBe('acquired');
    expect(readDaemonLock(home)).toEqual(mine);
  });

  it('M1.8-E12 release removes only its own lock', () => {
    const home = temporaryFolder();
    const mine = record();
    acquireDaemonLock(home, mine, ids.next());
    const other = record();
    writeFileSync(join(home, 'daemon.lock'), JSON.stringify(other));
    releaseDaemonLock(home, mine.nonce);
    expect(readDaemonLock(home)).toEqual(other);
    releaseDaemonLock(home, other.nonce);
    expect(readDaemonLock(home)).toBeUndefined();
  });
});
