import { spawnSync } from 'node:child_process';
import { readFileSync, writeSync } from 'node:fs';
import { createRequire } from 'node:module';
import { threadId } from 'node:worker_threads';
import { z, type Ext } from '@kvman/sdk';
import { outcomeOf } from './outcomes.ts';

const caught = z.object({ caught: z.boolean() });

// What the host is, and what its sandbox lets a handler do.
export function registerProbeSandbox(ext: Ext): void {
  ext.registerCommand('probe.whoami', { description: 'Its host process and thread.', input: z.object({}), handle: async () => ({ pid: process.pid, threadId }) });
  ext.registerCommand('probe.global.ping', { description: 'Its host without a workspace.', input: z.object({}), scope: 'global', handle: async () => ({ pid: process.pid, threadId }) });
  ext.registerCommand('probe.read', {
    description: 'Reads a file.', input: caught.extend({ path: z.string() }),
    handle: async ({ path, caught: catching }) => {
      if (!catching) return { text: readFileSync(path).subarray(0, 15).toString('latin1') };
      return outcomeOf(() => readFileSync(path).subarray(0, 15).toString('latin1'));
    },
  });
  ext.registerCommand('probe.spawn', {
    description: 'Starts a process.', input: caught,
    handle: async ({ caught: catching }) => {
      const run = (): number | null => {
        const result = spawnSync(process.execPath, ['-e', '0']);
        if (result.error !== undefined) throw result.error;
        return result.status;
      };
      return catching ? outcomeOf(run) : { status: run() };
    },
  });
  ext.registerCommand('probe.addon', { description: 'Loads a native addon.', input: z.object({}), handle: async () => ({ loaded: process.dlopen({ exports: {} }, '/kvman-probe/missing.node') }) });
  ext.registerCommand('probe.sqlite', {
    description: 'Tries the three ways to load node:sqlite.', input: z.object({}),
    handle: async () => ({
      imported: await outcomeOf(async () => Object.keys(await import('node:sqlite')).length),
      required: await outcomeOf(() => Object.keys(createRequire(import.meta.url)('node:sqlite')).length),
      builtin: process.getBuiltinModule('node:sqlite') === undefined ? 'undefined' : 'loaded',
    }),
  });
  ext.registerCommand('probe.env', { description: 'The names of its environment variables.', input: z.object({}), handle: async () => ({ names: Object.keys(process.env) }) });
  ext.registerCommand('probe.noise', {
    description: 'Writes frame-like lines to stdout and stderr.', input: z.object({}),
    handle: async () => {
      console.log('{"frame":"complete","invocationId":"x"}');
      process.stdout.write('not a frame\n');
      console.error('{"frame":"rpc"}');
      return {};
    },
  });
  ext.registerCommand('probe.forge', {
    description: 'Writes a line that is not a frame to the frame pipe on its first attempt, and returns on the next.', input: z.object({}),
    handle: async (_input, ctx) => {
      let first = false;
      await ctx.step('forge', async () => {
        first = true;
        return {};
      });
      if (first) writeSync(3, 'not a frame\n');
      if (first) await new Promise((resolve) => setTimeout(resolve, 60_000));
      return { forged: first };
    },
  });
  ext.registerCommand('probe.exit', {
    description: 'Exits its host on the first attempt, and returns on the next.', input: z.object({}),
    handle: async (_input, ctx) => {
      let first = false;
      await ctx.step('mark', async () => {
        first = true;
        return {};
      });
      if (first) process.exit(1);
      return { survived: true };
    },
  });
  ext.registerCommand('probe.hold', {
    description: 'Waits a minute on its first attempt, and returns on the next.', input: z.object({}),
    handle: async (_input, ctx) => {
      let first = false;
      await ctx.step('hold', async () => {
        first = true;
        return {};
      });
      if (first) await new Promise((resolve) => setTimeout(resolve, 60_000));
      return { held: first };
    },
  });
  ext.registerCommand('probe.hang', {
    description: 'Never returns and ignores its signal.', input: z.object({}), timeoutMs: 1000, maxAttempts: 1,
    handle: async () => new Promise<never>(() => undefined),
  });
}
