import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach } from 'vitest';

// A sandbox of temporary folders for one kvman child (the testkit's copy of the CLI's sandbox and kvman-child): the
// home the child runs with, the user folder its HOME points at (never the real one), and the folder it starts in.
// Children still running after a test are killed, and the folders removed.

export type DocsSandbox = {
  root: string;
  home: string;
  user: string;
  start: string;
  track(finish: () => Promise<void>): void;
};

export type StartedKvman = { port: number; home: string; stop(): Promise<void> };

const mainFile = fileURLToPath(new URL('../../../cli/src/main.ts', import.meta.url));
const urlPattern = /http:\/\/127\.0\.0\.1:(\d+)\/\?workspace=\S+/;

export function useDocsSandbox(): () => DocsSandbox {
  const roots: string[] = [];
  const finishes: (() => Promise<void>)[] = [];
  afterEach(async () => {
    for (const finish of finishes.splice(0)) await finish();
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });
  return () => {
    const root = mkdtempSync(path.join(tmpdir(), 'kvman-docs-'));
    roots.push(root);
    const folder = (name: string): string => {
      const made = path.join(root, name);
      mkdirSync(made, { recursive: true });
      return made;
    };
    return { root, home: folder('home'), user: folder('user'), start: folder('start'), track: (finish) => finishes.push(finish) };
  };
}

// Starts kvman from source with `--home <home> --port 0 --no-open --yes`, and resolves once it prints its URL. The
// child's HOME (USERPROFILE on Windows) is the sandbox's user folder, KVMAN_HOME is removed, and stdin is a pipe.
export function startKvman(sandbox: DocsSandbox, args: readonly string[]): Promise<StartedKvman> {
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: sandbox.user, USERPROFILE: sandbox.user };
  delete env['KVMAN_HOME'];
  const child = spawn(process.execPath, ['--conditions=@kvman/source', mainFile, '--home', sandbox.home, '--port', '0', '--no-open', '--yes', ...args], {
    cwd: sandbox.start,
    env,
    stdio: 'pipe',
  });
  let output = '';
  let errors = '';
  child.stdout.setEncoding('utf8').on('data', (text: string) => {
    output += text;
  });
  child.stderr.setEncoding('utf8').on('data', (text: string) => {
    errors += text;
  });
  const exit = new Promise<number | string>((resolve) => {
    child.once('exit', (code, signal) => resolve(code ?? signal ?? 'unknown'));
  });
  sandbox.track(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await exit;
  });
  const stop = async (): Promise<void> => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGINT');
    await exit;
  };
  return new Promise((resolve, reject) => {
    const check = (): void => {
      const match = urlPattern.exec(output);
      if (match !== null) resolve({ port: Number(match[1]), home: sandbox.home, stop });
    };
    child.stdout.on('data', check);
    check();
    void exit.then((ended) => reject(new Error(`kvman ended (${String(ended)}) before printing its URL.\nstdout:\n${output}\nstderr:\n${errors}`)));
  });
}
