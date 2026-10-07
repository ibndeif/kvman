import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { TestKernel } from '@kvman/testkit';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, fsCall, runs, says, shell, toolResults, type RunCallSpec } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';

const kvcoder = useKvcoder();

// Which calls wait for the person (08 §8.3, ADR 0009, 161; ADR 0011, 7): under `auto` the ones whose payload doesn't say
// `risky: false`, under `ask` every `shell exec`, binary `exec`, `fs write`, and `fs edit`.
async function started(settings: Record<string, string>, ...calls: readonly RunCallSpec[]) {
  const world = await kvcoder.start({ settings });
  const sessionId = await newSession(world.kernel);
  world.fake.reply(runs(...calls), says('ok'));
  await world.kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  await world.kernel.clock.advance(0);
  return { ...world, sessionId };
}

const answer = async (kernel: TestKernel, sessionId: string, index: number, confirmed: boolean): Promise<void> => {
  const { turn } = await turnState(kernel, sessionId);
  await kernel.exec('kvcoder.question.answer', { questionId: String(turn?.pending[index]?.questionId), answer: { confirmed } });
  await kernel.clock.advance(0);
};

const home = (kernel: TestKernel, file: string): string => path.join(kernel.homeFolder, file);

describe('risky calls ask, the others run (08 §8.3, ADR 0009, 161)', { timeout: 30_000 }, () => {
  it('QA4-H9 under auto a call with risky false runs at once and one with risky true waits until allowed', async () => {
    const { kernel, fake, sessionId } = await started({ 'kvcoder.shell.approval': 'auto' }, shell('touch safe.txt'), shell('touch risky.txt', { risky: true }));
    const { session, turn } = await turnState(kernel, sessionId);
    expect(session.status).toBe('waiting');
    expect(turn?.pending.map((item) => item.kind)).toEqual(['approval']);
    expect(turn?.pending[0]?.question).toEqual({ description: 'A test call.', connector: 'shell', command: 'exec', payload: { line: 'touch risky.txt', risky: true } });
    expect(existsSync(home(kernel, 'safe.txt'))).toBe(true);
    expect(existsSync(home(kernel, 'risky.txt'))).toBe(false);
    await answer(kernel, sessionId, 0, true);
    expect(existsSync(home(kernel, 'risky.txt'))).toBe(true);
    expect(toolResults(fake)).toEqual(['[exit code 0]', '[exit code 0]']);
  });

  it('QA4-H10 under ask every call waits, a fs call included', async () => {
    const { kernel, sessionId } = await started({ 'kvcoder.shell.approval': 'ask' }, shell('echo safe'), fsCall('write', { path: 'a.txt', content: 'x' }));
    const { turn } = await turnState(kernel, sessionId);
    expect(turn?.pending.map((item) => item.kind)).toEqual(['approval', 'approval']);
    expect(turn?.pending[1]?.question).toMatchObject({ connector: 'fs', command: 'write', payload: { path: 'a.txt', content: 'x' } });
    expect(existsSync(home(kernel, 'a.txt'))).toBe(false);
  });

  it('QA4-H11 under auto a fs call runs at once unless risky, and a denied one writes nothing', async () => {
    const { kernel, fake, sessionId } = await started({ 'kvcoder.shell.approval': 'auto' }, fsCall('write', { path: 'plain.txt', content: 'plain' }), fsCall('write', { path: 'risky.txt', content: 'risky', risky: true }));
    expect(readFileSync(home(kernel, 'plain.txt'), 'utf8')).toBe('plain');
    expect((await turnState(kernel, sessionId)).turn?.pending).toHaveLength(1);
    await answer(kernel, sessionId, 0, false);
    expect(toolResults(fake)).toEqual([expect.stringContaining('"created":true') as unknown, 'denied by the user']);
    expect(existsSync(home(kernel, 'risky.txt'))).toBe(false);
  });

  it('QA4-H11 an allowed risky fs call writes and returns its JSON', async () => {
    const { kernel, fake, sessionId } = await started({ 'kvcoder.shell.approval': 'auto' }, fsCall('write', { path: 'risky.txt', content: 'risky', risky: true }));
    expect(existsSync(home(kernel, 'risky.txt'))).toBe(false);
    await answer(kernel, sessionId, 0, true);
    expect(readFileSync(home(kernel, 'risky.txt'), 'utf8')).toBe('risky');
    expect(toolResults(fake)[0]).toBe('{"path":"risky.txt","created":true,"bytes":5}');
  });

  it('QA4-E14 fs help never asks, even under ask', async () => {
    const { kernel, fake, sessionId } = await started({ 'kvcoder.shell.approval': 'ask' }, command('fs', 'help'));
    expect((await turnState(kernel, sessionId)).turn?.pending).toEqual([]);
    expect(toolResults(fake)[0]).toMatch(/^fs: Read, list, search/);
  });

  it('QA4-E15 the other built-in connectors never ask, even under ask', async () => {
    const { kernel, fake, sessionId } = await started({ 'kvcoder.shell.approval': 'ask' }, command('background', 'list'), fsCall('list'));
    expect((await turnState(kernel, sessionId)).turn?.pending).toEqual([]);
    expect(toolResults(fake)[0]).toBe('[]');
  });

  it('QA4-E16 a risky background call asks too, and starts only when allowed', async () => {
    if (process.platform === 'win32') throw new Error('These calls are bash; Windows runs PowerShell.');
    const { kernel, sessionId } = await started({ 'kvcoder.shell.approval': 'auto' }, shell('sleep 30', { background: true, risky: true }));
    expect(await kernel.exec('kvcoder.job.list', { sessionId })).toEqual([]);
    expect((await turnState(kernel, sessionId)).turn?.pending[0]?.question).toMatchObject({ payload: { background: true } });
    await answer(kernel, sessionId, 0, true);
    expect(await kernel.exec('kvcoder.job.list', { sessionId })).toEqual([expect.objectContaining({ kind: 'process', status: 'running' }) as unknown]);
  });

  it('QA4-E17 a fs call waiting for approval writes nothing when the turn is cancelled', async () => {
    const { kernel, sessionId } = await started({ 'kvcoder.shell.approval': 'ask' }, fsCall('write', { path: 'never.txt', content: 'x' }));
    await kernel.exec('kvcoder.turn.cancel', { sessionId });
    await kernel.clock.advance(0);
    expect(existsSync(home(kernel, 'never.txt'))).toBe(false);
    expect((await turnState(kernel, sessionId)).turn).toMatchObject({ outcome: 'cancelled' });
  });

  it('QA11-H4 and QA11-E4 under auto a call without risky is refused and asks nobody; risky false runs at once; under ask a marked call waits', async () => {
    const unmarked = command('shell', 'exec', { line: 'touch unmarked.txt' });
    const { kernel, fake, sessionId } = await started({ 'kvcoder.shell.approval': 'auto' }, unmarked, shell('touch marked.txt'));
    const { session, turn } = await turnState(kernel, sessionId);
    expect(session.status).toBe('idle');
    expect(turn?.pending).toEqual([]);
    expect(toolResults(fake)).toEqual(['error VALIDATION_FAILED: risky: Invalid input: expected boolean, received undefined. The payload of shell exec is\n{ line, background?, timeoutMs?, risky }', '[exit code 0]']);
    expect(existsSync(home(kernel, 'marked.txt'))).toBe(true);
    expect(existsSync(home(kernel, 'unmarked.txt'))).toBe(false);

    const asking = await started({ 'kvcoder.shell.approval': 'ask' }, shell('touch one.txt'), unmarked);
    expect((await turnState(asking.kernel, asking.sessionId)).turn?.pending.map((item) => item.kind)).toEqual(['approval']);
    expect(existsSync(home(asking.kernel, 'unmarked.txt'))).toBe(false);
  });
});
