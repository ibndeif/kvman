import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ownPortOf } from '../../src/record/own-port.ts';

const homes: string[] = [];
afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

function home(lock?: string): string {
  const folder = mkdtempSync(path.join(tmpdir(), 'kvvideo-home-'));
  homes.push(folder);
  if (lock !== undefined) writeFileSync(path.join(folder, 'kvman.lock'), lock);
  return folder;
}

describe("kvman's own port (16 §16.5, ADR 0107, 18)", () => {
  it('M5.2-E2 the port comes from <KVMAN_HOME>/kvman.lock; no home, no lock, or no port is none', () => {
    expect(ownPortOf(home(JSON.stringify({ pid: 10, port: 3737 })))).toBe(3737);
    expect(ownPortOf(home(JSON.stringify({ pid: 10 })))).toBeNull();
    expect(ownPortOf(home())).toBeNull();
    expect(ownPortOf(undefined)).toBeNull();
    expect(ownPortOf('')).toBeNull();
  });
});
