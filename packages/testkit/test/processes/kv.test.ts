import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { objectOf, openProcessesFixture, processTests, spawned, type ProcessesFixture } from './harness.ts';

let fixture: ProcessesFixture | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

async function script(fixture: ProcessesFixture, text: string, calls: string[]): Promise<{ exitCode: unknown; log: string }> {
  const answer = await spawned(fixture, { command: 'sh', args: ['-c', text], token: { calls } }, { wait: true, read: true });
  return { exitCode: objectOf(answer['result'])['exitCode'], log: String(answer['log']) };
}

// The output between the markers `[<n>:<exit code>]` a script prints after each step.
function steps(log: string): Map<string, { output: string; exit: string }> {
  const found = new Map<string, { output: string; exit: string }>();
  let rest = log;
  for (const match of log.matchAll(/\[(\d+):(\d+)\]\n/g)) {
    const [marker, step = '', exit = ''] = match;
    const index = rest.indexOf(marker);
    found.set(step, { output: rest.slice(0, index), exit });
    rest = rest.slice(index + marker.length);
  }
  return found;
}

describe('the kv shim (plan 12 §12.6, ADR 0141)', () => {
  it('M2.6-H3 kv help lists only allowed types', processTests, async () => {
    fixture = await openProcessesFixture();
    const { exitCode, log } = await script(fixture, 'kv help', ['runner.*', 'target.ping']);
    expect(exitCode).toBe(0);
    for (const type of ['runner.echo', 'runner.status.get', 'runner.serve', 'runner.defer', 'runner.fail', 'runner.run']) expect(log).toContain(`- \`${type}\` (`);
    expect(log).toContain('- `runner.echo` (command): Echoes its text with its message envelope.');
    for (const type of ['runner.reveal', 'runner.record', 'runner.finish', 'target.ping']) expect(log).not.toContain(`\`${type}\``);
  });

  it('M2.6-E29 kv sends, prints, and exits by the rules inside a process', processTests, async () => {
    fixture = await openProcessesFixture();
    const text = [
      'kv runner.echo --text hi 2>/dev/null; echo "[1:$?]"',
      'kv runner.fail 2>/dev/null; echo "[2:$?]"',
      'kv runner.fail 2>&1 >/dev/null; echo "[3:$?]"',
      `printf '{"text":"from stdin"}' | kv runner.echo --json - 2>/dev/null; echo "[4:$?]"`,
      'kv runner.echo --text 2>&1; echo "[5:$?]"',
      'kv help runner.echo; echo "[6:$?]"',
      'env -u KVMAN_TOKEN kv runner.echo --text hi 2>&1; echo "[7:$?]"',
      'echo "$PATH"; echo "[8:0]"',
    ].join('\n');
    const found = steps((await script(fixture, text, ['runner.*'])).log);
    const echoed = found.get('1');
    expect(echoed?.exit).toBe('0');
    expect(objectOf(objectOf(JSON.parse(echoed?.output ?? '{}'))['data'])['text']).toBe('hi');
    expect(found.get('2')).toEqual({ output: '', exit: '1' });
    expect(objectOf(objectOf(JSON.parse(found.get('3')?.output ?? '{}'))['problem'])['code']).toBe('runner/FAILED');
    expect(objectOf(objectOf(JSON.parse(found.get('4')?.output ?? '{}'))['data'])['text']).toBe('from stdin');
    expect(found.get('5')?.exit).toBe('2');
    expect(found.get('5')?.output).toMatch(/^kv: --text needs a value\n$/);
    expect(found.get('6')?.output).toContain('# `runner.echo` (command)');
    expect(found.get('7')?.exit).toBe('2');
    expect(found.get('7')?.output).toMatch(/^kv: KVMAN_SOCKET and KVMAN_TOKEN are not set/);
    expect(found.get('8')?.output.trim().endsWith(`:${join(fixture.home, 'bin')}`)).toBe(true);
  });
});
