import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach } from 'vitest';
import { z } from '@kvman/sdk';
import { createTestKernel, type TestKernel, type TestKernelOptions } from '../src/index.ts';

// Test extensions written to a temporary folder: no node_modules there, so `@kvman/sdk` resolves only through the
// kernel. Each is a `path:` extension whose `index.ts` entry loads through Node's type stripping.

export type TestExtension = {
  name: string;
  namespace: string;
  entry: string;
  version?: string;
  sdkRange?: string;
  dependencies?: Record<string, string>;
  kvmanExtra?: Record<string, unknown>;
  // Other files of the extension, by path within its folder, such as `locales/fr.json`.
  files?: Record<string, string>;
};

function writeExtension(root: string, extension: TestExtension): string {
  const folder = path.join(root, extension.name.replace('/', '__'));
  mkdirSync(folder);
  const peerDependencies = extension.sdkRange === '' ? {} : { '@kvman/sdk': extension.sdkRange ?? '^0.1.0' };
  const kvman = { namespace: extension.namespace, source: 'index.ts', dependencies: extension.dependencies ?? {}, ...extension.kvmanExtra };
  const manifest = { name: extension.name, version: extension.version ?? '0.1.0', type: 'module', main: 'index.js', peerDependencies, kvman };
  writeFileSync(path.join(folder, 'package.json'), JSON.stringify(manifest));
  writeFileSync(path.join(folder, 'index.ts'), extension.entry);
  for (const [file, content] of Object.entries(extension.files ?? {})) {
    mkdirSync(path.dirname(path.join(folder, file)), { recursive: true });
    writeFileSync(path.join(folder, file), content);
  }
  return folder;
}

const logLineSchema = z.record(z.string(), z.unknown());

export type Harness = {
  start(extensions: readonly TestExtension[], options?: Omit<TestKernelOptions, 'extensions'>): Promise<TestKernel>;
  // The folder of an extension of the last start, to edit it.
  folder(name: string): string;
  // A temporary folder removed after the test, such as a workspace to open.
  temporaryFolder(): string;
  logLines(kernel: TestKernel): Record<string, unknown>[];
};

// Starts test kernels on temporary extensions, and closes and removes them after each test.
export function useHarness(): Harness {
  const roots: string[] = [];
  const kernels: TestKernel[] = [];
  const folders = new Map<string, string>();
  const temporaryFolder = (): string => {
    const root = mkdtempSync(path.join(tmpdir(), 'kvman-extensions-'));
    roots.push(root);
    return root;
  };
  afterEach(async () => {
    for (const kernel of kernels.splice(0)) await kernel.close();
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });
  return {
    start: async (extensions, options) => {
      const root = temporaryFolder();
      const written = extensions.map((extension) => {
        const folder = writeExtension(root, extension);
        folders.set(extension.name, folder);
        return folder;
      });
      const kernel = await createTestKernel({ ...options, extensions: written });
      kernels.push(kernel);
      return kernel;
    },
    folder: (name) => {
      const folder = folders.get(name);
      if (folder === undefined) throw new Error(`no test extension ${name}`);
      return folder;
    },
    temporaryFolder,
    logLines: (kernel) =>
      readFileSync(path.join(kernel.home, 'logs', 'kvman.log'), 'utf8')
        .split('\n')
        .filter((line) => line !== '')
        .map((line) => logLineSchema.parse(JSON.parse(line))),
  };
}

// An entry's source: the SDK import, then the body of the default-exported function of `ctx`.
export function entry(body: string): string {
  return `import { z, ProblemError, type Ctx } from '@kvman/sdk';\n\nexport default (ctx: Ctx): void => {\n${body}\n};\n`;
}

// Entry code shared by the async tests: a counter in the store, and waiting for the job's signal to abort.
export const counting = `
  const bump = async (key: string) => { const count = z.number().parse((await ctx.store.kv.get(key)) ?? 0) + 1; await ctx.store.kv.set(key, count); return count; };
  const aborted = (signal: AbortSignal) => signal.aborted ? Promise.resolve() : new Promise((resolve) => signal.addEventListener('abort', resolve));
  ctx.registerQuery(\`\${NAMESPACE}.count-get\`, { description: 'Reads a counter.', input: z.object({ key: z.string() }), output: z.unknown(), public: true,
    handle: async (input) => (await ctx.store.kv.get(input.key)) ?? 0 });
`;

export function countingEntry(namespace: string, body: string): string {
  return entry(counting.replaceAll('${NAMESPACE}', namespace) + body);
}

// Entry code for a handler that waits until the test releases it: `await gate('<name>')`. It tells the test it is waiting
// only once it listens, so a release is never missed. BroadcastChannel reaches worker threads of the same process.
export const gateEntry = `
  const gate = (name: string) => new Promise<void>((resolve) => {
    const channel = new BroadcastChannel(name);
    channel.onmessage = () => { channel.close(); resolve(); };
    const ready = new BroadcastChannel(name + ':ready');
    ready.postMessage('ready');
    ready.close();
  });
`;

export type Gate = { waiting: Promise<void>; release(): void };

// The test's side of a gate: `waiting` resolves once a handler waits at it; `release` lets it go on.
export function openGate(name: string): Gate {
  const ready = new BroadcastChannel(`${name}:ready`);
  const waiting = new Promise<void>((resolve) => {
    ready.onmessage = () => {
      ready.close();
      resolve();
    };
  });
  return {
    waiting,
    release: () => {
      const channel = new BroadcastChannel(name);
      channel.postMessage('go');
      channel.close();
    },
  };
}

// Hot reload happens on real file events, so tests wait for what's public (ADR 0009, 26).
export const reloadWait = { timeout: 15_000, interval: 25 };

export async function revisionOf(kernel: TestKernel, name: string): Promise<number | undefined> {
  return (await kernel.exec('kernel.extensions.list', {})).find((extension) => extension.name === name)?.revision;
}

// An extension that runs long-lived processes through `ctx.processes`, and records each `kernel.process.exited`.
export const processOwner: TestExtension = {
  name: '@test/p',
  namespace: 'p',
  entry: entry(`
  const named = z.object({ name: z.string() });
  ctx.registerCommand('p.start', {
    description: 'Starts a process.',
    input: z.object({ name: z.string(), args: z.array(z.string()), command: z.string().optional(), cwd: z.string().optional(), env: z.record(z.string(), z.string()).optional() }),
    output: z.unknown(), public: true,
    handle: (input) => ctx.processes.start(input.name, { command: input.command ?? process.execPath, args: input.args,
      ...(input.cwd === undefined ? {} : { cwd: input.cwd }), ...(input.env === undefined ? {} : { env: input.env }) }),
  });
  ctx.registerCommand('p.stop', { description: 'Stops a process.', input: named, output: z.object({}), public: true, handle: async (input) => { await ctx.processes.stop(input.name); return {}; } });
  ctx.registerQuery('p.list', { description: 'Lists processes.', input: z.object({}), output: z.unknown(), public: true, handle: () => ctx.processes.list() });
  ctx.registerQuery('p.log', { description: 'Reads a log.', input: z.object({ name: z.string(), tail: z.number().optional() }), output: z.string(), public: true,
    handle: (input) => ctx.processes.log(input.name, input.tail === undefined ? undefined : { tail: input.tail }) });
  ctx.registerQuery('p.start-in-query', { description: 'Starts from a query.', input: z.object({}), output: z.unknown(), public: true,
    handle: () => ctx.processes.start('late', { command: process.execPath }) });
  ctx.registerQuery('p.stop-in-query', { description: 'Stops from a query.', input: z.object({}), output: z.unknown(), public: true, handle: () => ctx.processes.stop('late') });
  ctx.registerHandler('kernel.process.exited', { description: 'Records exits.', handle: (input) => {
    ctx.store.transaction((tx) => { tx.global.kv.set('exited', [...z.array(z.unknown()).parse(tx.global.kv.get('exited') ?? []), input]); });
  } });
  ctx.registerQuery('p.exited-get', { description: 'Reads the exits.', input: z.object({}), output: z.unknown(), public: true,
    handle: async () => (await ctx.store.global.kv.get('exited')) ?? [] });`),
};

// Node scripts for the processes the tests run.
export const scripts = {
  forever: 'setInterval(() => {}, 1 << 30);',
  // Prints a line, then exits with code 3 once the file named by its argument exists.
  untilFlag: `const fs = require('node:fs'); const path = require('node:path'); const flag = process.argv[1]; console.log('hello');
    const check = () => { if (fs.existsSync(flag)) process.exit(3); }; fs.watch(path.dirname(flag), check); check();`,
};

// Whether a process is still alive; a process that has gone isn't, and one of another user is.
export function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error instanceof Error && 'code' in error && error.code === 'EPERM';
  }
}
