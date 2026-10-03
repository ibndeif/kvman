import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { runBin } from '../support/run-bin.ts';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const failureSchema = z.object({ code: z.string(), message: z.string(), params: z.record(z.string(), z.unknown()).optional() });

function failingInstall(): Record<string, string> {
  const cache = mkdtempSync(path.join(tmpdir(), 'kvman-new-npm-cache-'));
  roots.push(cache);
  return { npm_config_registry: 'http://127.0.0.1:1/', npm_config_fetch_retries: '0', npm_config_cache: cache, npm_config_audit: 'false', npm_config_fund: 'false', npm_config_update_notifier: 'false' };
}

describe('kvman-new keeps the files when npm fails (09 §9.1, ADR 0010, 20)', () => {
  it('QA17-E12 a failing install exits 1 NPM_FAILED with npm output, and the files stay', async () => {
    const parent = mkdtempSync(path.join(tmpdir(), 'kvman-new-npm-'));
    roots.push(parent);
    const run = await runBin('new/new-bin.js', ['notes', '--name', '@me/notes', '--namespace', 'notes', '--json'], { cwd: parent, env: failingInstall() });
    expect(run.exitCode).toBe(1);
    expect(run.stdout).toBe('');
    const failure = failureSchema.parse(JSON.parse(run.stderr));
    expect(failure.code).toBe('NPM_FAILED');
    expect(failure.message).toMatch(/npm install failed in notes \(exit code \d+\):\n.*npm error/s);
    expect(typeof failure.params?.['folder']).toBe('string');
    expect(path.isAbsolute(String(failure.params?.['folder']))).toBe(true);
    expect(failure.params?.['folder']).toBe(path.join(parent, 'notes'));
    expect(typeof failure.params?.['exitCode']).toBe('number');
    expect(existsSync(path.join(parent, 'notes', 'src', 'index.ts'))).toBe(true);
  });

  it('QA17-E31 npm missing from the PATH fails NPM_FAILED, and the files stay', async () => {
    const parent = mkdtempSync(path.join(tmpdir(), 'kvman-new-nopm-'));
    roots.push(parent);
    const emptyBin = mkdtempSync(path.join(tmpdir(), 'kvman-new-no-npm-'));
    roots.push(emptyBin);
    const run = await runBin('new/new-bin.js', ['notes', '--name', '@me/notes', '--namespace', 'notes', '--json'], { cwd: parent, env: { ...failingInstall(), PATH: emptyBin } });
    expect(run.exitCode).toBe(1);
    expect(run.stdout).toBe('');
    const failure = failureSchema.parse(JSON.parse(run.stderr));
    expect(failure.code).toBe('NPM_FAILED');
    expect(failure.message).toBe("npm isn't on the PATH; install Node.js with npm.");
    expect(existsSync(path.join(parent, 'notes', 'src', 'index.ts'))).toBe(true);
  });
});
