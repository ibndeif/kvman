import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { api } from '../support/api.ts';
import { startKvman, stopKvman } from '../support/kvman-child.ts';
import { useSandbox, type Sandbox } from '../support/sandbox.ts';

const sandbox = useSandbox();

const marker = 'PAYLOAD-MARKER-5f2c';

function logFile(home: string): string {
  return readFileSync(path.join(home, 'logs', 'kvman.log'), 'utf8');
}

// Runs kvman at a log level: an echo and a failure whose inputs and outputs hold the marker, and a warning.
async function logAt(world: Sandbox, level: string): Promise<{ file: string; terminal: string }> {
  const kvman = await startKvman(world, ['--preset', world.appPreset(), '--log-level', level]);
  const calls = api(kvman.port);
  expect(await calls.command('app.echo', { text: marker })).toMatchObject({ ok: true, output: { text: marker } });
  expect(await calls.command('app.fail', { text: marker })).toMatchObject({ ok: false, problem: { code: 'app/BROKEN' } });
  expect(await calls.command('app.warn', {})).toMatchObject({ ok: true });
  expect(await stopKvman(kvman)).toBe(0);
  return { file: logFile(world.home), terminal: kvman.errors() };
}

describe('logs (01 §1.3, ADR 0009, 49)', { timeout: 60_000 }, () => {
  it('M1.8-H9 logs hold no payloads, and --log-level filters the file and the terminal', async () => {
    const debug = await logAt(sandbox(), 'debug');
    for (const text of [debug.file, debug.terminal]) {
      expect(text).not.toContain(marker);
      expect(text).toContain('app.warn warned.');
      expect(text).toContain('app.warn informed.');
      expect(text).toContain('app.warn debugged.');
    }
    expect(debug.terminal).toMatch(/^\d\d:\d\d:\d\d DEBUG An HTTP call started a job\.$/m);
    expect(debug.terminal).toMatch(/^\d\d:\d\d:\d\d WARN app\.warn warned\.$/m);
    const warn = await logAt(sandbox(), 'warn');
    for (const text of [warn.file, warn.terminal]) {
      expect(text).not.toContain(marker);
      expect(text).toContain('app.warn warned.');
      expect(text).not.toContain('app.warn informed.');
      expect(text).not.toContain('app.warn debugged.');
      expect(text).not.toContain('An HTTP call started a job.');
    }
  });
});
