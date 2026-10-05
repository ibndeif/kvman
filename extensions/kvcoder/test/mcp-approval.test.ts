import { describe, expect, it } from 'vitest';
import type { TestKernel } from '@kvman/testkit';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { commandEntry } from './support/mcp-servers.ts';
import { command, runs, says, toolResults, type RunCallSpec } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';

const kvcoder = useKvcoder();

const call = (text: string, more: Record<string, unknown>): RunCallSpec => command('mcp', 'call', { server: 'demo', tool: 'echo', arguments: { text }, ...more });

async function started(approval: 'auto' | 'ask', ...calls: readonly RunCallSpec[]) {
  const world = await kvcoder.start({ settings: { 'kvcoder.shell.approval': approval, 'kvcoder.mcp.servers': [commandEntry()] } });
  const sessionId = await newSession(world.kernel);
  world.fake.reply(runs(...calls), says('ok'));
  await world.kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  await world.kernel.clock.advance(0);
  return { ...world, sessionId };
}

const answer = async (kernel: TestKernel, sessionId: string, confirmed: boolean): Promise<void> => {
  const { turn } = await turnState(kernel, sessionId);
  await kernel.exec('kvcoder.question.answer', { questionId: String(turn?.pending[0]?.questionId), answer: { confirmed } });
  await kernel.clock.advance(0);
};

describe('an mcp call asks as a shell call does (08 §8.3 and §8.5, ADR 0020, 7)', { timeout: 60_000 }, () => {
  it('QA29-H7 under auto a risky call waits until allowed and the others run; tools never asks', async () => {
    const { kernel, fake, sessionId } = await started('auto', call('safe', { risky: false }), call('risky', { risky: true }), command('mcp', 'tools', { server: 'demo', tool: 'echo' }));
    const { session, turn } = await turnState(kernel, sessionId);
    expect(session.status).toBe('waiting');
    expect(turn?.pending.map((item) => item.kind)).toEqual(['approval']);
    expect(turn?.pending[0]?.question).toEqual({ description: 'A test call.', connector: 'mcp', command: 'call', payload: { server: 'demo', tool: 'echo', arguments: { text: 'risky' }, risky: true } });
    await answer(kernel, sessionId, true);
    const results = toolResults(fake);
    expect(results.slice(0, 2)).toEqual(['safe', 'risky']);
    expect(results[2]).toContain('"name": "echo"');
  });

  it('QA29-H7 under ask every call waits, a denied one runs nothing, and tools still runs at once', async () => {
    const { kernel, fake, sessionId } = await started('ask', call('one', { risky: false }), command('mcp', 'tools', { server: 'demo' }));
    expect((await turnState(kernel, sessionId)).turn?.pending.map((item) => item.kind)).toEqual(['approval']);
    await answer(kernel, sessionId, false);
    const results = toolResults(fake);
    expect(results[0]).toBe('denied by the user');
    expect(results[1]).toContain('"tools"');
  });

  it('QA29-E9 a payload that does not fit fails VALIDATION_FAILED with the signature, and nobody is asked', async () => {
    const signature = 'The payload of mcp call is\n{ server, tool, arguments?, timeoutMs?, risky }';
    const { kernel, fake, sessionId } = await started('ask', call('x', {}), call('x', { risky: false, extra: 1 }), command('mcp', 'call', { server: 'demo', tool: 'echo', arguments: 'text', risky: false }));
    expect((await turnState(kernel, sessionId)).session.status).toBe('idle');
    const results = toolResults(fake);
    expect(results).toHaveLength(3);
    for (const result of results) {
      expect(result).toMatch(/^error VALIDATION_FAILED: /);
      expect(result.endsWith(signature)).toBe(true);
    }
    expect(results[0]).toContain('risky');
    expect(results[1]).toContain('Unrecognized key: "extra"');
    expect(results[2]).toContain('arguments');
  });
});
