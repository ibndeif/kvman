import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach } from 'vitest';
import type { UninstallArguments } from '../../src/arguments.ts';
import type { ProgramResult } from '../../src/uninstall/run-program.ts';
import { runUninstall, type UninstallEnvironment } from '../../src/uninstall/run-uninstall.ts';

// A world for `kvman uninstall` (ADR 0031): a temporary home with data, a fake npm whose global folder holds (or
// doesn't hold) this kvman, a fake running kvman that dies some time after it is asked to stop, and a clock that
// moves only when the command waits. Nothing here runs the real npm or touches the real home.

export type WorldOptions = {
  // The lines typed, or `end` for the end of input with nothing typed.
  answers?: readonly string[] | 'end';
  isTerminal?: boolean;
  platform?: NodeJS.Platform;
  // Where `npm root -g` points: at this kvman, at another folder, at this kvman through a link, or npm is missing.
  npm?: 'global' | 'elsewhere' | 'linked' | 'missing';
  uninstallCode?: number;
  // A kvman on the home: the milliseconds it takes to stop once asked, or `never`; `gone` is a lock nobody holds.
  running?: number | 'never' | 'gone';
  home?: 'missing';
};

export type World = {
  root: string;
  home: string;
  outside: { workspace: string; preset: string };
  programs: { program: string; args: string[]; output: string; homeExisted: boolean; kvmanAlive: boolean }[];
  signals: number[];
  shown(): string;
  errors(): string;
  // The end of input, after what was typed.
  endInput(): void;
  run(args?: Partial<UninstallArguments>): Promise<number>;
};

export const kvmanPid = 4242;

const roots: string[] = [];

export function useWorlds(): (options?: WorldOptions) => World {
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });
  return createWorld;
}

function collect(stream: PassThrough): () => string {
  let text = '';
  stream.setEncoding('utf8').on('data', (chunk: string) => (text += chunk));
  return () => text;
}

function createWorld(options: WorldOptions = {}): World {
  const root = mkdtempSync(path.join(tmpdir(), 'kvman-uninstall-'));
  roots.push(root);
  const home = path.join(root, 'home');
  if (options.home !== 'missing') {
    mkdirSync(path.join(home, 'presets'), { recursive: true });
    writeFileSync(path.join(home, 'kvman.db'), 'data');
    writeFileSync(path.join(home, 'presets', 'mine.json'), '{}');
  }
  const workspace = path.join(root, 'workspace');
  mkdirSync(workspace);
  writeFileSync(path.join(workspace, 'notes.txt'), 'mine');
  const preset = path.join(root, 'app.json');
  writeFileSync(preset, '{}');
  const packageFolder = path.join(root, 'global', 'kvman');
  mkdirSync(packageFolder, { recursive: true });
  mkdirSync(path.join(root, 'other'));
  if (options.npm === 'linked') symlinkSync(path.join(root, 'global'), path.join(root, 'link'), process.platform === 'win32' ? 'junction' : 'dir');
  const npmRoot = options.npm === 'elsewhere' ? path.join(root, 'other') : options.npm === 'linked' ? path.join(root, 'link') : path.join(root, 'global');

  const input = new PassThrough();
  const output = new PassThrough();
  const errorStream = new PassThrough();
  const shown = collect(output);
  const errors = collect(errorStream);
  if (options.answers === 'end') input.end();
  else for (const answer of options.answers ?? []) input.write(`${answer}\n`);

  let now = 0;
  let diesAt: number | undefined;
  const hasKvman = options.running !== undefined && options.running !== 'gone';
  if (options.running !== undefined && options.home !== 'missing') writeFileSync(path.join(home, 'kvman.lock'), JSON.stringify({ pid: kvmanPid, port: 3737 }));
  const alive = (): boolean => hasKvman && (diesAt === undefined || now < diesAt);
  const askedToStop = (): void => {
    if (typeof options.running === 'number') diesAt = now + options.running;
  };

  const world: World = {
    root,
    home,
    outside: { workspace, preset },
    programs: [],
    signals: [],
    shown,
    errors,
    endInput: () => input.end(),
    run: (args = {}) => runUninstall({ kind: 'uninstall', home, yes: false, data: 'ask', ...args }, environment),
  };
  const answerOf = (program: string, args: readonly string[]): ProgramResult => {
    if (program === 'taskkill') {
      askedToStop();
      return { started: true, code: 0, output: '' };
    }
    if (options.npm === 'missing') return { started: false, code: 1, output: '' };
    if (args[0] === 'root') return { started: true, code: 0, output: `${npmRoot}\n` };
    return { started: true, code: options.uninstallCode ?? 0, output: 'removed 1 package\n' };
  };
  const environment: UninstallEnvironment = {
    variables: {},
    userFolder: path.join(root, 'user'),
    platform: options.platform ?? 'linux',
    terminal: { input, output, isTerminal: options.isTerminal ?? true },
    errors: errorStream,
    packageFolder,
    runProgram: (program, args, shownOrCaptured) => {
      world.programs.push({ program, args: [...args], output: shownOrCaptured, homeExisted: existsSync(home), kvmanAlive: alive() });
      return Promise.resolve(answerOf(program, args));
    },
    isAlive: (pid) => pid === kvmanPid && alive(),
    sendStop: (pid) => {
      world.signals.push(pid);
      askedToStop();
    },
    wait: (milliseconds) => {
      now += milliseconds;
      return Promise.resolve();
    },
  };
  return world;
}

export const npmCalls = (world: World): string[] => world.programs.filter((call) => call.program === 'npm').map((call) => call.args.join(' '));
