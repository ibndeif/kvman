import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runBin, type BinRun } from './run-bin.ts';
import { startKvman, type DocsSandbox, type StartedKvman } from './kvman-child.ts';

// One kvman child running the bundled extensions for the `kvman-preset` checks: its home is the sandbox home (the
// bins find it with `--home`), and each test writes its preset files into a folder of its own in a temporary folder
// (never the sandbox home) and runs the bin there, so a preset argument is a relative path like `app.json`.

export type PresetWorld = {
  home: string;
  port: number;
  // A fresh folder for one test's preset files.
  nextCase(): string;
  stop(): Promise<void>;
};

const runningPreset = {
  name: 'preset-test',
  extensions: { '@kvman/kvai': 'bundled', '@kvman/kvwebui': 'bundled', '@kvman/kvcoder': 'bundled' },
  settings: { 'kvwebui.home': 'kvcoder.chat', 'kernel.workers': 1 },
};

/** Starts the preset-test kvman child; call `stop` in `afterAll` to kill it and remove every folder. */
export async function startPresetWorld(): Promise<PresetWorld> {
  const root = mkdtempSync(path.join(tmpdir(), 'kvman-preset-'));
  const folder = (name: string): string => {
    const made = path.join(root, name);
    mkdirSync(made, { recursive: true });
    return made;
  };
  const finishes: (() => Promise<void>)[] = [];
  const sandbox: DocsSandbox = { root, home: folder('home'), user: folder('user'), start: folder('start'), track: (finish) => finishes.push(finish) };
  let started: StartedKvman | undefined;
  try {
    const presetFile = path.join(sandbox.start, 'preset-test.json');
    writeFileSync(presetFile, `${JSON.stringify(runningPreset, undefined, 2)}\n`);
    started = await startKvman(sandbox, ['--preset', presetFile]);
  } catch (error) {
    for (const finish of finishes.splice(0)) await finish();
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
  const running = started;
  let cases = 0;
  return {
    home: sandbox.home,
    port: running.port,
    nextCase: () => {
      cases += 1;
      return folder(path.join('cases', `case-${String(cases)}`));
    },
    stop: async () => {
      await running.stop();
      for (const finish of finishes.splice(0)) await finish();
      rmSync(root, { recursive: true, force: true });
    },
  };
}

/** Writes `value` as JSON into `<folder>/<file>`, creating its folders. */
export function writeJsonFile(folder: string, file: string, value: unknown): void {
  const absolute = path.join(folder, file);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, JSON.stringify(value));
}

/** Writes `text` into `<folder>/<file>`, creating its folders. */
export function writeTextFile(folder: string, file: string, text: string): void {
  const absolute = path.join(folder, file);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, text);
}

/** A package.json with a `kvman` field, as `ext new` writes one, for a `path:` fixture. */
export function projectManifest(name: string, namespace: string): unknown {
  return { name, version: '0.1.0', type: 'module', main: 'dist/index.js', peerDependencies: { '@kvman/sdk': '^0.1.0' }, kvman: { namespace, source: 'src/index.ts', dependencies: {} } };
}

/** Runs the built `kvman-preset` bin with `args` in `cwd`. */
export function presetBin(args: readonly string[], cwd: string): Promise<BinRun> {
  return runBin('preset/preset-bin.js', args, { cwd });
}

/** A 127.0.0.1 port nothing listens on, for `--url` checks with no kvman running. */
export async function closedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}
