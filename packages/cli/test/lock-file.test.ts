import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const lockModule = fileURLToPath(new URL('../src/lock-file.ts', import.meta.url));

// Each taker takes the lock, prints what it got, and stays alive until its stdin ends, so a taken lock stays live.
const takerScript = `
import { takeLock } from ${JSON.stringify(lockModule)};
const result = takeLock(process.argv[1]);
process.stdout.write(result.kind + '\\n');
process.stdin.resume();
process.stdin.on('end', () => process.exit(0));
`;

const homes: string[] = [];
afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

async function race(home: string, takers: number): Promise<string[]> {
  const children = Array.from({ length: takers }, () =>
    spawn(process.execPath, ['--conditions=@kvman/source', '--input-type=module', '-e', takerScript, home], { stdio: ['pipe', 'pipe', 'inherit'] }),
  );
  const kinds = await Promise.all(
    children.map(
      (child) =>
        new Promise<string>((resolve) => {
          let output = '';
          child.stdout.setEncoding('utf8').on('data', (text: string) => {
            output += text;
            if (output.endsWith('\n')) resolve(output.trim());
          });
        }),
    ),
  );
  await Promise.all(children.map((child) => new Promise((resolve) => child.once('exit', resolve).stdin.end())));
  return kinds;
}

describe('taking kvman.lock (ADR 0009, 43)', { timeout: 60_000 }, () => {
  it('M1.8-E6 of takers racing for a missing or a stale lock, exactly one takes it', async () => {
    const missing = mkdtempSync(path.join(tmpdir(), 'kvman-lock-'));
    homes.push(missing);
    expect((await race(missing, 8)).sort()).toEqual(['held', 'held', 'held', 'held', 'held', 'held', 'held', 'taken']);
    const stale = mkdtempSync(path.join(tmpdir(), 'kvman-lock-'));
    homes.push(stale);
    mkdirSync(stale, { recursive: true });
    writeFileSync(path.join(stale, 'kvman.lock'), JSON.stringify({ pid: spawnSync(process.execPath, ['-e', '']).pid }));
    expect((await race(stale, 8)).sort()).toEqual(['held', 'held', 'held', 'held', 'held', 'held', 'held', 'taken']);
    expect(Object.keys(JSON.parse(readFileSync(path.join(stale, 'kvman.lock'), 'utf8')))).toEqual(['pid']);
  });
});
