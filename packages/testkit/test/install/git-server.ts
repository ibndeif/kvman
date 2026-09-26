import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createServer, connect } from 'node:net';
import { join } from 'node:path';
import { vi } from 'vitest';
import { temporary } from './packages.ts';

export type GitServer = { url(repository: string): string; commit(repository: string, folder: string): string; close(): void };

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

function accepting(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(port, '127.0.0.1', () => {
      socket.end();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
  });
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 't@example.com' } }).trim();
}

// A local `git daemon` serving repositories over git:// (ADR 0116); every commit is a new repository's only commit.
export async function startGitServer(): Promise<GitServer> {
  const root = temporary('git');
  const port = await freePort();
  const daemon = spawn('git', ['daemon', '--reuseaddr', '--export-all', `--base-path=${root}`, `--port=${port}`, '--listen=127.0.0.1', root], { stdio: 'ignore' });
  await vi.waitFor(async () => {
    if (!(await accepting(port))) throw new Error(`git daemon is not listening on ${port} yet`);
  }, { timeout: 10_000, interval: 20 });
  return {
    url: (repository) => `git://127.0.0.1:${port}/${repository}.git`,
    commit: (repository, folder) => {
      const target = join(root, `${repository}.git`);
      mkdirSync(target, { recursive: true });
      git(folder, 'init', '--quiet', '--initial-branch=main');
      git(folder, 'add', '--all');
      git(folder, 'commit', '--quiet', '--message', 'the package');
      git(root, 'clone', '--quiet', '--bare', folder, target);
      return git(folder, 'rev-parse', 'HEAD');
    },
    close: () => {
      daemon.kill('SIGKILL');
    },
  };
}
