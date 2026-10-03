import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { runBin, type BinRun } from '../support/run-bin.ts';
import { pidAlive, previewHomePath, usePreviewSandbox, waitForFile } from '../support/preview-world.ts';

// `kvman-preview` failures (09 §9.3, ADR 0010, 20, 21): every failure exits 1, removes the home, and prints one JSON
// object with `--json` or one `error: …` line without it.
const makeSandbox = usePreviewSandbox();

const failureSchema = z.object({ code: z.string(), message: z.string(), params: z.record(z.string(), z.json()).optional() });

type Failure = { code: string; message: string; params?: Record<string, unknown> };

function failureOf(run: BinRun): Failure {
  expect(run.exitCode).toBe(1);
  expect(run.stdout).toBe('');
  expect(run.stderr.trim().split('\n')).toHaveLength(1);
  return failureSchema.parse(JSON.parse(run.stderr)) as Failure;
}

describe('kvman-preview failures (09 §9.3, ADR 0010, 20, 21)', () => {
  it('QA17-E13 a kvman missing from the PATH fails PREVIEW_FAILED as JSON and as text', async () => {
    const sandbox = makeSandbox();
    const empty = sandbox.folder('empty-path');
    const made = sandbox.project('demo');
    const json = await runBin('preview/preview-bin.js', [made.folder, '--name', 'e13-nopath', '--json'], {
      cwd: sandbox.root,
      env: { PATH: empty },
    });
    const parsed = failureOf(json);
    expect(parsed.code).toBe('PREVIEW_FAILED');
    expect(parsed.message).toContain("kvman isn't on the PATH");
    expect(existsSync(previewHomePath('e13-nopath'))).toBe(false);
    const human = await runBin('preview/preview-bin.js', [made.folder, '--name', 'e13-nopath-human'], {
      cwd: sandbox.root,
      env: { PATH: empty },
    });
    expect(human.exitCode).toBe(1);
    expect(human.stdout).toBe('');
    expect(human.stderr.startsWith("error: kvman isn't on the PATH")).toBe(true);
    expect(human.stderr.trim().split('\n')).toHaveLength(1);
    expect(existsSync(previewHomePath('e13-nopath-human'))).toBe(false);
  });

  it('QA17-E13 a preview that exits before answering fails with its last lines', async () => {
    const sandbox = makeSandbox();
    const fake = sandbox.fake('fake');
    const made = sandbox.project('demo');
    const run = await runBin('preview/preview-bin.js', [made.folder, '--kvman', fake.entry, '--name', 'e13-early', '--json'], {
      cwd: sandbox.root,
      env: { FAKE_KVMAN_LOG: fake.log, FAKE_KVMAN_MODE: 'exit-early' },
    });
    const failure = failureOf(run);
    expect(failure.code).toBe('PREVIEW_FAILED');
    expect(failure.message.startsWith('The preview kvman exited before it answered:')).toBe(true);
    expect(failure.message).toContain('fake kvman failing');
    expect(existsSync(previewHomePath('e13-early'))).toBe(false);
  });

  // The silent preview really takes the whole 30 s readiness wait, so this test needs a 60 s timeout.
  it('QA17-E13 a preview that never answers is given up after 30 s', { timeout: 60_000 }, async () => {
    const sandbox = makeSandbox();
    const fake = sandbox.fake('fake');
    const made = sandbox.project('demo');
    const home = previewHomePath('e13-silent');
    const started = runBin('preview/preview-bin.js', [made.folder, '--kvman', fake.entry, '--name', 'e13-silent', '--json'], {
      cwd: sandbox.root,
      env: { FAKE_KVMAN_LOG: fake.log, FAKE_KVMAN_MODE: 'silent' },
    });
    await waitForFile(path.join(home, 'kvman.lock'), 30_000);
    const lock = JSON.parse(readFileSync(path.join(home, 'kvman.lock'), 'utf8')) as { pid: number; port: number };
    const failure = failureOf(await started);
    expect(failure.code).toBe('PREVIEW_FAILED');
    expect(failure.message.startsWith("The preview kvman didn't answer within 30 s:")).toBe(true);
    expect(pidAlive(lock.pid)).toBe(false);
    await expect(fetch(`http://127.0.0.1:${String(lock.port)}/api/queries/kernel.health.get`, { method: 'POST' })).rejects.toThrow();
    expect(existsSync(home)).toBe(false);
  });

  it('QA17-E13 a second preview for a live name fails while the first is unaffected', async () => {
    const sandbox = makeSandbox();
    const fake = sandbox.fake('fake');
    const made = sandbox.project('demo');
    const first = sandbox.start([made.folder, '--kvman', fake.entry, '--name', 'e13-double', '--json'], {
      cwd: sandbox.root,
      env: { FAKE_KVMAN_LOG: fake.log },
    });
    const url = (JSON.parse(await first.line) as { url: string }).url;
    const second = await runBin('preview/preview-bin.js', [made.folder, '--kvman', fake.entry, '--name', 'e13-double', '--json'], {
      cwd: sandbox.root,
      env: { FAKE_KVMAN_LOG: fake.log },
    });
    const failure = failureOf(second);
    expect(failure.code).toBe('PREVIEW_FAILED');
    expect(failure.message).toContain('A preview named e13-double already runs');
    const health = await (await fetch(`${url}api/queries/kernel.health.get`, { method: 'POST', body: '{"input":{}}' })).json();
    expect(health).toMatchObject({ ok: true });
    first.signal('SIGTERM');
    expect(await first.exit).toEqual({ code: 0, signal: null });
  });

  it('QA17-E13 bad input fails VALIDATION_FAILED before anything starts and leaves no home', async () => {
    const sandbox = makeSandbox();
    const made = sandbox.project('demo');
    const plain = sandbox.folder('plain');
    mkdirSync(path.join(plain, 'project'), { recursive: true });
    writeFileSync(path.join(plain, 'project', 'package.json'), JSON.stringify({ name: '@preview/plain', version: '0.1.0' }));
    writeFileSync(path.join(plain, 'broken.json'), '{ not json');
    writeFileSync(path.join(plain, 'schema.json'), JSON.stringify({ name: 'broken' }));
    const missing = path.join(plain, 'missing.mjs');
    const cases: { name: string; args: string[]; message: string }[] = [
      { name: 'e13-nofolder', args: ['--json'], message: 'At least one <folder> argument is required.' },
      { name: 'e13-nopackage', args: [path.join(plain, 'gone'), '--json'], message: 'has no package.json with a kvman field.' },
      { name: 'e13-nokvman', args: [path.join(plain, 'project'), '--json'], message: 'has no package.json with a kvman field.' },
      { name: 'e13-badjson', args: [made.folder, '--preset', path.join(plain, 'broken.json'), '--json'], message: 'is invalid; run kvman-preset check on it.' },
      { name: 'e13-badschema', args: [made.folder, '--preset', path.join(plain, 'schema.json'), '--json'], message: 'is invalid; run kvman-preset check on it.' },
      { name: 'e13-nokvmanbin', args: [made.folder, '--kvman', missing, '--json'], message: "doesn't exist; pass the entry file" },
    ];
    for (const item of cases) {
      const run = await runBin('preview/preview-bin.js', [...item.args.slice(0, -1), '--name', item.name, '--json'], {
        cwd: sandbox.root,
      });
      const failure = failureOf(run);
      expect(failure.code).toBe('VALIDATION_FAILED');
      expect(failure.message).toContain(item.message);
      expect(existsSync(previewHomePath(item.name))).toBe(false);
    }
    const human = await runBin('preview/preview-bin.js', ['--name', 'e13-nofolder-human'], { cwd: sandbox.root });
    expect(human.exitCode).toBe(1);
    expect(human.stdout).toBe('');
    expect(human.stderr).toBe('error: At least one <folder> argument is required. Usage: kvman-preview <folder>… [--preset <file>] [--kvman <entry>] [--name <name>] [--json]\n');
  });

  it('QA17-E13 a preview that exits by itself stops the watcher and fails PREVIEW_FAILED', async () => {
    const sandbox = makeSandbox();
    const fake = sandbox.fake('fake');
    const made = sandbox.project('demo', { scripts: { 'web:build': 'node build.cjs', 'web:watch': 'node watch.cjs' } });
    const home = previewHomePath('e13-dies');
    const run = await runBin('preview/preview-bin.js', [made.folder, '--kvman', fake.entry, '--name', 'e13-dies', '--json'], {
      cwd: sandbox.root,
      env: { FAKE_KVMAN_LOG: fake.log, FAKE_KVMAN_MODE: 'die-after-ready' },
    });
    expect(run.exitCode).toBe(1);
    expect(run.stdout.trim().split('\n')).toHaveLength(1);
    expect((JSON.parse(run.stdout) as { url: string }).url.startsWith('http://127.0.0.1:')).toBe(true);
    const failure = failureSchema.parse(JSON.parse(run.stderr)) as Failure;
    expect(failure.code).toBe('PREVIEW_FAILED');
    expect(failure.message.startsWith('The preview kvman exited:')).toBe(true);
    const watcher = Number(readFileSync(path.join(made.folder, 'watch.pid'), 'utf8'));
    expect(pidAlive(watcher)).toBe(false);
    expect(existsSync(home)).toBe(false);
  });

  it('QA17-E13 a failing web:build fails before any kvman starts', async () => {
    const sandbox = makeSandbox();
    const fake = sandbox.fake('fake');
    const made = sandbox.project('demo', { scripts: { 'web:build': 'node -e "process.exit(2)"', 'web:watch': 'node -e ""' } });
    const run = await runBin('preview/preview-bin.js', [made.folder, '--kvman', fake.entry, '--name', 'e13-build', '--json'], {
      cwd: sandbox.root,
      env: { FAKE_KVMAN_LOG: fake.log },
    });
    const failure = failureOf(run);
    expect(failure.code).toBe('PREVIEW_FAILED');
    expect(failure.message).toContain(`npm run web:build failed in ${made.folder}`);
    expect(existsSync(fake.log)).toBe(false);
    expect(existsSync(previewHomePath('e13-build'))).toBe(false);
  });
});
