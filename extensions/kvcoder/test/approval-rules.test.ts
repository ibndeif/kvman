import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { TestKernel } from '@kvman/testkit';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { commandEntry } from './support/mcp-servers.ts';
import { command, fsCall, runs, says, shell, type RunCallSpec } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';

const kvcoder = useKvcoder();

// The person's approval rules (08 §8.3, ADR 0091, 1 and 2): a covered call runs without asking.
const node = { name: 'node', description: 'Node.js.', binary: { check: 'node --version' } };
type Rule = { kind: 'line'; prefix: string } | { kind: 'files' };

async function started(rules: readonly Rule[], approval: 'auto' | 'ask', ...calls: readonly RunCallSpec[]) {
  const settings = { 'kvcoder.approval': approval, 'kvcoder.approval.allowed': rules, 'kvcoder.connectors': [node], 'kvcoder.mcp.servers': [commandEntry()] } as unknown as Record<string, string>;
  const world = await kvcoder.start({ settings });
  const sessionId = await newSession(world.kernel);
  world.fake.reply(runs(...calls), says('ok'));
  await world.kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  await world.kernel.clock.advance(0);
  return { ...world, sessionId };
}

const asked = async (kernel: TestKernel, sessionId: string): Promise<unknown[]> => ((await turnState(kernel, sessionId)).turn?.pending ?? []).map((item) => item.question);
const made = (kernel: TestKernel, file: string): boolean => existsSync(path.join(kernel.homeFolder, file));

describe('approval rules (08 §8.3, ADR 0091, 1 and 2)', { timeout: 30_000 }, () => {
  it('QA59-H1 a line a rule covers runs without asking, and one it does not still asks', async () => {
    const { kernel, sessionId } = await started([{ kind: 'line', prefix: 'touch' }], 'auto', shell('touch covered.txt', { risky: true }), shell('mkdir asked', { risky: true }));
    expect(made(kernel, 'covered.txt')).toBe(true);
    expect(await asked(kernel, sessionId)).toEqual([{ connector: 'shell', command: 'exec', payload: { line: 'mkdir asked', risky: true } }]);
  });

  it('QA59-H2 a files rule lets file changes run without asking', async () => {
    const { kernel, sessionId } = await started([{ kind: 'files' }], 'auto', fsCall('write', { path: 'a.txt', content: 'x', risky: true }), shell('touch b.txt', { risky: true }));
    expect(made(kernel, 'a.txt')).toBe(true);
    expect(await asked(kernel, sessionId)).toHaveLength(1);
  });

  it('QA59-H3 rules apply under ask too', async () => {
    const { kernel, sessionId } = await started([{ kind: 'line', prefix: 'touch' }], 'ask', shell('touch covered.txt'), shell('ls'));
    expect(made(kernel, 'covered.txt')).toBe(true);
    expect(await asked(kernel, sessionId)).toEqual([{ connector: 'shell', command: 'exec', payload: { line: 'ls', risky: false } }]);
  });

  it("QA59-E4 a binary's line is matched as its name and arguments", async () => {
    const { kernel, sessionId } = await started([{ kind: 'line', prefix: 'node -e' }], 'auto', command('node', 'exec', { args: '-e "1"', risky: true }), command('node', 'exec', { args: '--version', risky: true }));
    expect(await asked(kernel, sessionId)).toEqual([{ connector: 'node', command: 'exec', payload: { args: '--version', risky: true } }]);
  });

  it('QA59-E5 no rule covers an mcp call', async () => {
    const { kernel, sessionId } = await started([{ kind: 'line', prefix: 'demo' }, { kind: 'files' }], 'auto', command('mcp', 'call', { server: 'demo', tool: 'echo', arguments: { text: 'x' }, risky: true }));
    expect(await asked(kernel, sessionId)).toHaveLength(1);
  });

  it("QA59-E6 a rule added while an approval waits doesn't answer it, and counts from the next step", async () => {
    const world = await kvcoder.start({ settings: { 'kvcoder.approval': 'auto' } });
    const { kernel, fake } = world;
    const sessionId = await newSession(kernel);
    fake.reply(runs(shell('touch first.txt', { risky: true })), runs(shell('touch second.txt', { risky: true })), says('done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    await kernel.exec('kernel.settings.set', { key: 'kvcoder.approval.allowed', value: [{ kind: 'line', prefix: 'touch' }], scope: 'workspace' });
    expect(await asked(kernel, sessionId)).toHaveLength(1);
    const { turn } = await turnState(kernel, sessionId);
    await kernel.exec('kvcoder.question.answer', { questionId: String(turn?.pending[0]?.questionId), answer: { confirmed: true } });
    await kernel.clock.advance(0);
    expect(made(kernel, 'first.txt')).toBe(true);
    expect(made(kernel, 'second.txt')).toBe(true);
    expect((await turnState(kernel, sessionId)).session.status).toBe('idle');
  });
});
