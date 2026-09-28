import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { binFolderOf, createUlidGenerator, Kernel, ProblemError, socketPathOf } from '@kvman/kernel';
import { socketLimits } from '@kvman/protocol';
import { describe, expect, it } from 'vitest';
import { enableHostFixtures, installHostFixtures, ManualTimers } from '../hosts/harness.ts';
import { closedRegistry, noBuiltins, prepareHome } from '../install/fixture-snapshots.ts';
import { objectOf, socketRequest } from '../processes/harness.ts';
import { bootFixture, temporaryHome } from './harness.ts';

async function preparedHome(home: string): Promise<void> {
  await prepareHome(home, async (connection, folder) => {
    await installHostFixtures(connection, folder);
    enableHostFixtures(connection);
  });
}

describe('the kv shim and kernel.sock at boot (plan 12 §12.4, §12.6, ADRs 0140, 0141)', () => {
  it('M2.6-E30 the shim is rewritten at every start with the running Node', async () => {
    const home = temporaryHome();
    await preparedHome(home);
    mkdirSync(binFolderOf(home), { recursive: true });
    writeFileSync(join(binFolderOf(home), 'kv'), '#!/nonexistent/node\n');
    const fixture = await bootFixture({ home });
    try {
      const shim = join(binFolderOf(home), 'kv');
      const [shebang, launcher] = readFileSync(shim, 'utf8').split('\n');
      expect(shebang).toBe(`#!${process.execPath}`);
      expect(launcher).toMatch(/^import\(".*\/kv\/kv-main\.(ts|js)"\);$/);
      expect(statSync(shim).mode & 0o777).toBe(0o755);
    } finally {
      await fixture.close();
    }
  });

  it('M2.6-E31 kernel.sock replaces a stale file, is 0600 while the kernel runs, goes at shutdown, and must fit its path limit', async () => {
    const home = temporaryHome();
    await preparedHome(home);
    writeFileSync(socketPathOf(home), 'stale');
    const fixture = await bootFixture({ home });
    const stat = statSync(socketPathOf(home));
    expect(stat.isSocket()).toBe(true);
    expect(stat.mode & 0o777).toBe(0o600);
    expect(objectOf((await socketRequest(socketPathOf(home), JSON.stringify({ token: 'made-up', op: 'help' })))['problem'])['code']).toBe('CAPABILITY_DENIED');
    await fixture.close();
    expect(existsSync(socketPathOf(home))).toBe(false);

    const parent = mkdtempSync(join(tmpdir(), 'kvman-long-'));
    const room = socketLimits.pathBytes + 1 - Buffer.byteLength(join(parent, 'kernel.sock')) - 1;
    const longHome = join(parent, 'h'.repeat(room));
    expect(Buffer.byteLength(socketPathOf(longHome))).toBe(socketLimits.pathBytes + 1);
    const timers = new ManualTimers();
    const refused = await Kernel.boot({
      home: longHome, builtin: noBuiltins(longHome), npmRegistry: closedRegistry, environment: {}, poolSize: 1, ids: createUlidGenerator(Date.now),
      now: () => timers.time.value, timers, openLogger: () => ({ write: () => undefined, close: () => undefined }),
    }).then(() => undefined, (error: unknown) => error);
    expect(refused).toBeInstanceOf(ProblemError);
    expect(refused instanceof ProblemError ? refused.problem : undefined).toMatchObject({ code: 'HOME_INVALID', hint: 'use a shorter home path with --home or KVMAN_HOME' });
  });
});
