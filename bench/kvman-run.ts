import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The built kvman, run as a person runs it (plan 12 §12.3): its own home and start folder under the bench's home, port
// 0, no browser. `msToUrl` is the time from spawn to the printed URL.

const mainFile = fileURLToPath(new URL('../packages/cli/dist/main.js', import.meta.url));

export type KvmanRun = { msToUrl: number; pid: number; stop(): Promise<void> };

export function runKvman(root: string, args: readonly string[]): Promise<KvmanRun> {
  const home = path.join(root, 'home');
  const project = path.join(root, 'project');
  mkdirSync(project, { recursive: true });
  const environment: NodeJS.ProcessEnv = { ...process.env, HOME: root, USERPROFILE: root };
  delete environment['KVMAN_HOME'];
  const started = performance.now();
  const child = spawn(process.execPath, [mainFile, '--home', home, '--port', '0', '--no-open', '--yes', ...args], { cwd: project, env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
  return new Promise((resolve, reject) => {
    let output = '';
    child.stderr.setEncoding('utf8').on('data', (text: string) => (output += text));
    child.stdout.setEncoding('utf8').on('data', (text: string) => {
      output += text;
      if (!/http:\/\/127\.0\.0\.1:\d+\//.test(output)) return;
      const stop = async (): Promise<void> => {
        child.kill('SIGINT');
        await exited;
      };
      resolve({ msToUrl: performance.now() - started, pid: child.pid ?? 0, stop });
    });
    void exited.then(() => reject(new Error(`kvman exited before printing its URL:\n${output}`)));
  });
}
