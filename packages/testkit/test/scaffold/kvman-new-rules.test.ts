import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import type { BinRun } from '../support/run-bin.ts';
import { runBin } from '../support/run-bin.ts';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const failureSchema = z.object({ code: z.string(), message: z.string(), params: z.record(z.string(), z.unknown()).optional() });

function makeParent(): string {
  const parent = mkdtempSync(path.join(tmpdir(), 'kvman-new-rules-'));
  roots.push(parent);
  return parent;
}

function failingInstall(): Record<string, string> {
  const cache = mkdtempSync(path.join(tmpdir(), 'kvman-new-rules-cache-'));
  roots.push(cache);
  return { npm_config_registry: 'http://127.0.0.1:1/', npm_config_fetch_retries: '0', npm_config_cache: cache, npm_config_audit: 'false', npm_config_fund: 'false', npm_config_update_notifier: 'false' };
}

function failure(run: BinRun): { code: string; message: string } {
  expect(run.exitCode).toBe(1);
  expect(run.stdout).toBe('');
  return failureSchema.parse(JSON.parse(run.stderr));
}

const valid = ['--name', '@me/notes', '--namespace', 'notes'];

describe('kvman-new refuses a used folder and bad input (09 §9.1, ADR 0010, 20)', () => {
  it('QA17-E11 a non-empty folder fails FOLDER_NOT_EMPTY with --json, writing nothing', async () => {
    const parent = makeParent();
    mkdirSync(path.join(parent, 'taken'));
    writeFileSync(path.join(parent, 'taken', 'notes.txt'), 'mine');
    const run = await runBin('new/new-bin.js', ['taken', ...valid, '--json'], { cwd: parent, env: failingInstall() });
    expect(failure(run).code).toBe('FOLDER_NOT_EMPTY');
    expect(run.stderr.trim().split('\n')).toHaveLength(1);
    expect(existsSync(path.join(parent, 'taken', 'package.json'))).toBe(false);
  });

  it('QA17-E11 an existing empty folder works up to the install', async () => {
    const parent = makeParent();
    mkdirSync(path.join(parent, 'notes'));
    const run = await runBin('new/new-bin.js', ['notes', ...valid, '--json'], { cwd: parent, env: failingInstall() });
    expect(failure(run).code).toBe('NPM_FAILED');
    expect(existsSync(path.join(parent, 'notes', 'src', 'index.ts'))).toBe(true);
  });

  it('QA17-E11 a bad --name or --namespace fails VALIDATION_FAILED, writing nothing', async () => {
    for (const args of [
      ['--name', 'Bad_Name', '--namespace', 'notes'],
      ['--name', '@me/notes', '--namespace', 'kernel'],
      ['--name', '@me/notes', '--namespace', 'Bad'],
    ]) {
      const parent = makeParent();
      const run = await runBin('new/new-bin.js', ['notes', ...args, '--json'], { cwd: parent, env: failingInstall() });
      expect(failure(run).code).toBe('VALIDATION_FAILED');
      expect(existsSync(path.join(parent, 'notes'))).toBe(false);
    }
  });

  it('QA17-E11 a missing --name, folder, or an unknown option or two folders fails VALIDATION_FAILED', async () => {
    const cases: string[][] = [
      ['notes', '--namespace', 'notes'],
      ['--name', '@me/notes', '--namespace', 'notes'],
      ['notes', ...valid, '--bogus'],
      ['first', 'second', ...valid],
    ];
    for (const args of cases) {
      const parent = makeParent();
      const run = await runBin('new/new-bin.js', [...args, '--json'], { cwd: parent, env: failingInstall() });
      expect(failure(run).code).toBe('VALIDATION_FAILED');
      expect(readdirSync(parent)).toEqual([]);
    }
  });

  it('QA17-E11 without --json stderr is the single line error: …', async () => {
    const parent = makeParent();
    const run = await runBin('new/new-bin.js', ['notes', '--name', 'Bad_Name', '--namespace', 'notes'], { cwd: parent, env: failingInstall() });
    expect(run.exitCode).toBe(1);
    expect(run.stdout).toBe('');
    expect(run.stderr).toMatch(/^error: [^\n]+\n$/);
    expect(existsSync(path.join(parent, 'notes'))).toBe(false);
  });
});
