import { describe, expect, it, vi } from 'vitest';
import { z } from '@kvman/sdk';
import { useLooked } from './support/looked.ts';
import { command, requestTools, systemPrompt, type RunCallSpec } from './support/model-script.ts';
import { wait } from './support/wait.ts';

const looked = useLooked();
const nothing = (): void => undefined;

const node = (binary: Record<string, string> = {}) => ({ 'kvcoder.connectors': [{ name: 'node', description: 'Node.js.', binary: { check: 'node --version', ...binary } }] }) as unknown as Record<string, string>;
const exec = (args: string, payload: Record<string, unknown> = {}): RunCallSpec => command('node', 'exec', { args, risky: false, ...payload });

describe('a binary connector (08 §8.4, ADR 0011, 5)', { timeout: 30_000 }, () => {
  it('QA18-H6 exec runs the program with its arguments in the real shell', async () => {
    const { results, fake } = await looked(nothing, [exec('-e "console.log(6*7)"'), command('node', 'exec', { risky: false })], node());
    expect(results[0]).toBe('42\n[exit code 0]');
    expect(systemPrompt(fake)).toContain('- node: Node.js. Commands: exec, help.');
  });

  it("QA18-H7 help describes exec and prints the program's own help, by --help or the registered line, and never asks", async () => {
    const plain = await looked(nothing, [command('node', 'help'), command('node', 'help', { command: 'exec' }), command('node', 'help', { command: '-p' })], { ...node(), 'kvcoder.shell.approval': 'ask' });
    expect(plain.results[0]).toMatch(/^node: Node\.js\.\n\nCommands:\n {2}exec {2}Runs the program with the given arguments.*\n {2}help {2}.*\n\n.*\n\nnode --help:\nUsage: node /);
    expect(plain.results[1]).toMatch(/^node exec: [\s\S]*Payload \(JSON Schema\):[\s\S]*"args"[\s\S]*Result: the combined output, then \[exit code N\]\.$/);
    expect(plain.results[2]).toMatch(/^node -p --help:\n/);
    const registered = await looked(nothing, [command('node', 'help'), command('node', 'help', { command: 'build' })], node({ help: `node -e "console.log('help {command}'.trim())"` }));
    expect(registered.results[0]).toMatch(/:\nhelp$/);
    expect(registered.results[1]).toMatch(/:\nhelp build$/);
  });

  it('QA18-E9 a binary whose check failed is not listed and cannot be called', async () => {
    const settings = { 'kvcoder.connectors': [{ name: 'absent', description: 'Not installed.', binary: { check: 'exit 3' } }] } as unknown as Record<string, string>;
    const { results, fake } = await looked(nothing, [command('absent', 'exec', { args: '--version', risky: false })], settings);
    expect(results[0]).toBe('error VALIDATION_FAILED: There is no connector absent. The connectors are: shell, fs, artifact, background, ask, subagent, todo.');
    expect(systemPrompt(fake)).not.toContain('- absent:');
    expect(JSON.stringify(requestTools(fake, 0))).not.toContain('absent');
  });

  it('QA18-E10 exec with background starts the program, and background lists it by its line', async () => {
    const started = await looked(nothing, [exec('-e "setTimeout(() => 0, 30000)"', { background: true })], node());
    const id = /^started (\S+)/.exec(started.results[0] ?? '')?.[1] ?? '';
    expect(id).not.toBe('');
    const rows = z.array(z.object({ id: z.string(), kind: z.string(), call: z.string(), status: z.string() })).parse(await started.kernel.exec('kvcoder.job.list', { sessionId: started.sessionId }));
    expect(rows).toEqual([expect.objectContaining({ id, kind: 'process', call: 'node -e "setTimeout(() => 0, 30000)"', status: 'running' })]);
    await started.kernel.exec('kvcoder.job.cancel', { sessionId: started.sessionId, id });
    await vi.waitFor(async () => expect(await started.kernel.exec('kvcoder.job.get', { sessionId: started.sessionId, id })).toMatchObject({ status: 'cancelled' }), wait);
  });
});
