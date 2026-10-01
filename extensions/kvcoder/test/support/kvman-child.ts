import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { vi } from 'vitest';
import { z } from '@kvman/sdk';
import { startFakeOpenAI, type FakeOpenAI } from '@kvman/testkit/fake-openai';

// A real kvman with kvai, kvwebui, and kvcoder bundled, run from the CLI's source in a temporary home and user folder,
// with the fake OpenAI server added as the provider `fake` over HTTP (plan 12 §12.1). `kill` SIGKILLs it, and `start`
// runs it again on the same home, as the crash invariants need (plan 12 §12.2).

const mainFile = fileURLToPath(new URL('../../../../packages/cli/src/main.ts', import.meta.url));
const urlPattern = /http:\/\/127\.0\.0\.1:(\d+)\/\?workspace=(\S+)/;
const envelopeSchema = z.union([z.object({ ok: z.literal(true), output: z.unknown() }), z.object({ ok: z.literal(false), problem: z.object({ code: z.string() }) })]);

export const childWait = { timeout: 20_000, interval: 50 };

export type Running = { origin: string; call(route: 'commands' | 'queries', name: string, input: unknown): Promise<unknown>; kill(): Promise<void> };

export type KvmanWorld = { fake: FakeOpenAI; start(): Promise<Running>; close(): Promise<void> };

function waitForUrl(child: ChildProcess, output: () => string): Promise<string> {
  return new Promise((resolve, reject) => {
    const check = (): void => {
      const match = urlPattern.exec(output());
      if (match !== null) resolve(match[0]);
    };
    child.stdout?.on('data', check);
    child.once('exit', (code) => reject(new Error(`kvman exited (${String(code)}) before printing its URL:\n${output()}`)));
  });
}

export async function kvmanWorld(): Promise<KvmanWorld> {
  const root = mkdtempSync(path.join(tmpdir(), 'kvcoder-e2e-'));
  const [home, user, project] = ['home', 'user', 'project'].map((name) => path.join(root, name));
  for (const folder of [user ?? '', project ?? '']) mkdirSync(folder, { recursive: true });
  const preset = { name: 'kvcoder-test', extensions: { '@kvman/kvai': 'bundled', '@kvman/kvwebui': 'bundled', '@kvman/kvcoder': 'bundled' }, settings: { 'kvwebui.home': 'kvcoder.chat', 'kvai.defaultModel': 'fake/m1', 'kvcoder.shell.approval': 'auto' } };
  const presetFile = path.join(root, 'kvcoder-test.json');
  writeFileSync(presetFile, JSON.stringify(preset));
  const fake = await startFakeOpenAI();
  const children: ChildProcess[] = [];
  let configured = false;

  const start = async (): Promise<Running> => {
    const env: NodeJS.ProcessEnv = { ...process.env, HOME: user, USERPROFILE: user };
    delete env['KVMAN_HOME'];
    const child = spawn(process.execPath, ['--conditions=@kvman/source', mainFile, '--home', home ?? '', '--port', '0', '--no-open', '--yes', '--preset', presetFile], { cwd: project, env, stdio: 'pipe' });
    children.push(child);
    let output = '';
    child.stdout.setEncoding('utf8').on('data', (text: string) => (output += text));
    child.stderr.setEncoding('utf8').on('data', (text: string) => (output += text));
    const origin = new URL(await waitForUrl(child, () => output)).origin;
    const call = async (route: 'commands' | 'queries', name: string, input: unknown): Promise<unknown> => {
      const response = await fetch(`${origin}/api/${route}/${name}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input }) });
      const answer = envelopeSchema.parse(await response.json());
      if (!answer.ok) throw new Error(`${name} failed: ${answer.problem.code}`);
      return answer.output;
    };
    if (!configured) {
      await call('commands', 'kvai.provider.add', { id: 'fake', title: 'Fake', api: 'openai-completions', baseUrl: fake.baseUrl });
      await call('commands', 'kvai.model.add', { provider: 'fake', id: 'm1', name: 'M1', reasoning: false, input: ['text'], contextWindow: 128_000, maxTokens: 8192 });
      configured = true;
    }
    const kill = async (): Promise<void> => {
      const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
      child.kill('SIGKILL');
      await exited;
    };
    return { origin, call, kill };
  };

  const close = async (): Promise<void> => {
    for (const child of children) {
      if (child.exitCode !== null || child.signalCode !== null) continue;
      const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
      child.kill('SIGTERM');
      await exited;
    }
    await fake.close();
    rmSync(root, { recursive: true, force: true });
  };
  return { fake, start, close };
}

/** Waits until a call's output passes `check`, and returns it. */
export function until<Output>(read: () => Promise<unknown>, schema: z.ZodType<Output>, check: (output: Output) => boolean): Promise<Output> {
  return vi.waitFor(async () => {
    const output = schema.parse(await read());
    if (!check(output)) throw new Error(`not yet: ${JSON.stringify(output)}`);
    return output;
  }, childWait);
}
