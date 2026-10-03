import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { repositoryRoot } from '../support/npm-mirror.ts';
import { runBin, type BinRun } from '../support/run-bin.ts';
import { useDocsSandbox, type DocsSandbox } from '../support/kvman-child.ts';

const makeSandbox = useDocsSandbox();

const failureSchema = z.object({ code: z.string(), message: z.string() });

const notRunningLine = "kvman isn't running; start it to read the extensions' docs.\n";

const builtInHuman = ['kvman', '  i18n: Texts and languages', '  presets: Presets', '  sdk: The extension API (`@kvman/sdk`)', ''].join('\n');

function expectNoInputLeak(run: BinRun): void {
  expect(run.stdout).not.toContain('{"input"');
  expect(run.stderr).not.toContain('{"input"');
}

function homeFolder(sandbox: DocsSandbox, name: string): string {
  const folder = path.join(sandbox.root, name);
  mkdirSync(folder, { recursive: true });
  return folder;
}

function writeLock(home: string, text: string): void {
  writeFileSync(path.join(home, 'kvman.lock'), text);
}

async function closedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  expect(port).toBeGreaterThan(0);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

type SeenRequest = { method: string | undefined; url: string | undefined; headers: IncomingHttpHeaders; body: string };

async function startCountingServer(): Promise<{ port: number; requests: SeenRequest[]; close(): Promise<void> }> {
  const requests: SeenRequest[] = [];
  const server: Server = createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => {
      body += chunk;
    });
    request.on('end', () => {
      requests.push({ method: request.method, url: request.url, headers: request.headers, body });
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, output: [], jobId: 'counting-1' }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  expect(port).toBeGreaterThan(0);
  return {
    port,
    requests,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error === undefined ? resolve() : reject(error)));
      });
    },
  };
}

describe('kvman-docs with no kvman running (ADR 0010, 17, 19)', () => {
  it('QA17-E28 list prints only the built-in guides, get of an extension topic fails NOT_RUNNING, get kvman sdk still works', async () => {
    const sandbox = makeSandbox();
    const sdkMarkdown = readFileSync(path.join(repositoryRoot, 'packages/testkit/docs/sdk.md'), 'utf8');
    const dead = spawnSync(process.execPath, ['-e', '']);
    if (dead.pid === undefined) throw new Error('The exited node process has no pid.');
    const shut = await closedPort();
    const homes: string[] = [];
    homes.push(homeFolder(sandbox, 'empty'));
    const deadPid = homeFolder(sandbox, 'dead-pid');
    writeLock(deadPid, JSON.stringify({ pid: dead.pid, port: 1 }));
    homes.push(deadPid);
    const noPort = homeFolder(sandbox, 'no-port');
    writeLock(noPort, JSON.stringify({ pid: process.pid }));
    homes.push(noPort);
    const shutPort = homeFolder(sandbox, 'shut-port');
    writeLock(shutPort, JSON.stringify({ pid: process.pid, port: shut }));
    homes.push(shutPort);
    const broken = homeFolder(sandbox, 'broken');
    writeLock(broken, '{');
    homes.push(broken);
    for (const home of homes) {
      const list = await runBin('docs/docs-bin.js', ['list', '--home', home], { cwd: sandbox.root });
      expect(list.exitCode).toBe(0);
      expect(list.stdout).toBe(builtInHuman);
      expect(list.stderr).toBe(notRunningLine);
      expectNoInputLeak(list);
      const get = await runBin('docs/docs-bin.js', ['get', '@fix/ok', 'usage', '--home', home, '--json'], { cwd: sandbox.root });
      expect(get.exitCode).toBe(1);
      expect(get.stdout).toBe('');
      expect(get.stderr.trim().split('\n')).toHaveLength(1);
      expect(failureSchema.parse(JSON.parse(get.stderr)).code).toBe('NOT_RUNNING');
      expectNoInputLeak(get);
      const guide = await runBin('docs/docs-bin.js', ['get', 'kvman', 'sdk', '--home', home], { cwd: sandbox.root });
      expect(guide.exitCode).toBe(0);
      expect(guide.stdout).toBe(`${sdkMarkdown}\n`);
      expect(guide.stderr).toBe('');
      expectNoInputLeak(guide);
    }
    const url = `http://127.0.0.1:${String(shut)}`;
    const list = await runBin('docs/docs-bin.js', ['list', '--url', url], { cwd: sandbox.root });
    expect(list.exitCode).toBe(0);
    expect(list.stdout).toBe(builtInHuman);
    expect(list.stderr).toBe(notRunningLine);
    expectNoInputLeak(list);
    const get = await runBin('docs/docs-bin.js', ['get', '@fix/ok', 'usage', '--url', url, '--json'], { cwd: sandbox.root });
    expect(get.exitCode).toBe(1);
    expect(failureSchema.parse(JSON.parse(get.stderr)).code).toBe('NOT_RUNNING');
    expectNoInputLeak(get);
  });

  it('QA17-E29 a --url that is not a 127.0.0.1 or localhost http URL fails VALIDATION_FAILED before any request', async () => {
    const sandbox = makeSandbox();
    const counting = await startCountingServer();
    try {
      const bad = ['http://example.com:80', 'http://127.0.0.1', 'https://127.0.0.1:1234', 'http://192.168.0.1:80', 'not a url', `http://localhost.evil.test:${String(counting.port)}`];
      for (const url of bad) {
        const run = await runBin('docs/docs-bin.js', ['list', '--url', url, '--json'], { cwd: sandbox.root });
        expect(run.exitCode).toBe(1);
        expect(run.stdout).toBe('');
        expect(run.stderr.trim().split('\n')).toHaveLength(1);
        expect(failureSchema.parse(JSON.parse(run.stderr)).code).toBe('VALIDATION_FAILED');
        expectNoInputLeak(run);
      }
      expect(counting.requests).toEqual([]);
    } finally {
      await counting.close();
    }
  });

  it('QA17-E29 a call sends only its input, with the expected Host and no Origin', async () => {
    const sandbox = makeSandbox();
    const counting = await startCountingServer();
    try {
      const run = await runBin('docs/docs-bin.js', ['list', '--url', `http://127.0.0.1:${String(counting.port)}`, '--json'], { cwd: sandbox.root });
      expect(run.exitCode).toBe(0);
      expect(run.stderr).toBe('');
      expect(JSON.parse(run.stdout)).toEqual({
        pages: [
          { extension: 'kvman', topic: 'i18n', title: 'Texts and languages' },
          { extension: 'kvman', topic: 'presets', title: 'Presets' },
          { extension: 'kvman', topic: 'sdk', title: 'The extension API (`@kvman/sdk`)' },
        ],
        problems: [],
      });
      expectNoInputLeak(run);
      expect(counting.requests).toHaveLength(1);
      const seen = counting.requests[0];
      if (seen === undefined) throw new Error('The counting server saw no request.');
      expect(seen.method).toBe('POST');
      expect(seen.url).toBe('/api/queries/kernel.extensions.list');
      expect(seen.headers['content-type']).toBe('application/json');
      expect(seen.body).toBe('{"input":{}}');
      expect(seen.headers['host']).toBe(`127.0.0.1:${String(counting.port)}`);
      expect(seen.headers['origin']).toBeUndefined();
    } finally {
      await counting.close();
    }
  });
});
