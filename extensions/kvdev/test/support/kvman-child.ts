import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { vi } from 'vitest';
import { outputEnvelopeSchema, ProblemError, failureEnvelopeSchema, z } from '@kvman/sdk';
import type { FakeOpenAI } from '@kvman/testkit/fake-openai';

// A real kvman run from the CLI's source (its bundled extensions built by the global setup) in a temporary home, user
// folder, and start folder (`project`), with port 0 and no browser. `call` runs in the start folder's workspace and
// answers a route's output, or rejects with the Problem as a `ProblemError`; `stop` stops it as Ctrl+C does.

const mainFile = fileURLToPath(new URL('../../../../packages/cli/src/main.ts', import.meta.url));
const urlPattern = /http:\/\/127\.0\.0\.1:(\d+)\/\?workspace=(\S+)/;
const answerSchema = z.union([outputEnvelopeSchema, failureEnvelopeSchema]);

export const childWait = { timeout: 60_000, interval: 100 };

export type Kvman = {
  origin: string;
  workspaceId: string;
  pid: number;
  call(route: 'commands' | 'queries', name: string, input: unknown): Promise<unknown>;
  stop(): Promise<void>;
};

export type KvmanWorld = { root: string; project: string; start(args: readonly string[], env?: Record<string, string>): Promise<Kvman>; close(): Promise<void> };

/** Calls a route of any kvman, the main one or a preview, in Home or the given workspace. */
export async function callKvman(origin: string, route: 'commands' | 'queries', name: string, input: unknown, workspaceId?: string): Promise<unknown> {
  const body = workspaceId === undefined ? { input } : { input, workspaceId };
  const response = await fetch(`${origin}/api/${route}/${name}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const answer = answerSchema.parse(await response.json());
  if (!answer.ok) throw new ProblemError(answer.problem);
  return answer.output;
}

function waitForUrl(child: ChildProcess, output: () => string): Promise<RegExpExecArray> {
  return new Promise((resolve, reject) => {
    const check = (): void => {
      const match = urlPattern.exec(output());
      if (match !== null) resolve(match);
    };
    child.stdout?.on('data', check);
    child.once('exit', (code) => reject(new Error(`kvman exited (${String(code)}) before printing its URL:\n${output()}`)));
  });
}

function stopped(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => child.once('exit', () => resolve()));
}

export function kvmanWorld(): KvmanWorld {
  const root = mkdtempSync(path.join(tmpdir(), 'kvdev-e2e-'));
  const [home, user, project] = ['home', 'user', 'project'].map((name) => path.join(root, name));
  for (const folder of [user ?? '', project ?? '']) mkdirSync(folder, { recursive: true });
  const children: ChildProcess[] = [];
  const start = async (args: readonly string[], env: Record<string, string> = {}): Promise<Kvman> => {
    const environment: NodeJS.ProcessEnv = { ...process.env, HOME: user, USERPROFILE: user, ...env };
    delete environment['KVMAN_HOME'];
    const child = spawn(process.execPath, ['--conditions=@kvman/source', mainFile, '--home', home ?? '', '--port', '0', '--no-open', '--yes', ...args], { cwd: project, env: environment, stdio: 'pipe' });
    children.push(child);
    let output = '';
    child.stdout.setEncoding('utf8').on('data', (text: string) => (output += text));
    child.stderr.setEncoding('utf8').on('data', (text: string) => (output += text));
    const [url = '', , workspaceId = ''] = await waitForUrl(child, () => output);
    const origin = new URL(url).origin;
    const stop = async (): Promise<void> => {
      child.kill('SIGINT');
      await stopped(child);
    };
    return { origin, workspaceId, pid: child.pid ?? 0, call: (route, name, input) => callKvman(origin, route, name, input, workspaceId), stop };
  };
  const close = async (): Promise<void> => {
    for (const child of children) {
      child.kill('SIGINT');
      await stopped(child);
    }
    rmSync(root, { recursive: true, force: true });
  };
  return { root, project: project ?? '', start, close };
}

/** Adds the fake OpenAI server as kvai's provider `fake` and makes `fake/m1` the default model for every workspace. */
export async function useFakeModel(kvman: Kvman, fake: FakeOpenAI): Promise<void> {
  await kvman.call('commands', 'kvai.provider.add', { id: 'fake', title: 'Fake', api: 'openai-completions', baseUrl: fake.baseUrl });
  await kvman.call('commands', 'kvai.model.add', { provider: 'fake', id: 'm1', name: 'M1', reasoning: false, input: ['text'], contextWindow: 128_000, maxTokens: 8192 });
  await kvman.call('commands', 'kernel.settings.set', { key: 'kvai.defaultModel', value: 'fake/m1', scope: 'global' });
}

/** Waits until `read` gives an output that passes `check`, and returns it. */
export function until<Output>(read: () => Promise<unknown>, schema: z.ZodType<Output>, check: (output: Output) => boolean): Promise<Output> {
  return vi.waitFor(async () => {
    const output = schema.parse(await read());
    if (!check(output)) throw new Error(`not yet: ${JSON.stringify(output)}`);
    return output;
  }, childWait);
}
