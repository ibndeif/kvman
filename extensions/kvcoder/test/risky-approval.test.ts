import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { TestKernel } from '@kvman/testkit';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { calls, fsCommand, says, toolResults, type ShellCallSpec } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';

const kvcoder = useKvcoder();

// Which calls wait for the person (08 §8.3, ADR 0009, 161): under `auto` the ones the model marks risky, under `ask`
// every real shell call and `fs` call.
async function started(settings: Record<string, string>, ...replies: readonly ShellCallSpec[]) {
  const world = await kvcoder.start({ settings });
  const sessionId = await newSession(world.kernel);
  world.fake.reply(calls(...replies), says('ok'));
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
    const { kernel, fake, sessionId } = await started({ 'kvcoder.shell.approval': 'auto' }, 'touch safe.txt', { command: 'touch risky.txt', risky: true });
    const { session, turn } = await turnState(kernel, sessionId);
    expect(session.status).toBe('waiting');
    expect(turn?.pending.map((item) => item.kind)).toEqual(['approval']);
    expect(turn?.pending[0]?.question).toMatchObject({ command: 'touch risky.txt', mode: 'sync' });
    expect(existsSync(home(kernel, 'safe.txt'))).toBe(true);
    expect(existsSync(home(kernel, 'risky.txt'))).toBe(false);
    await answer(kernel, sessionId, 0, true);
    expect(existsSync(home(kernel, 'risky.txt'))).toBe(true);
    expect(toolResults(fake)).toEqual(['[exit code 0]', '[exit code 0]']);
  });

  it('QA4-H10 under ask every call waits, a fs call included', async () => {
    const { kernel, sessionId } = await started({ 'kvcoder.shell.approval': 'ask' }, 'echo safe', fsCommand('write', { path: 'a.txt', content: 'x' }));
    const { turn } = await turnState(kernel, sessionId);
    expect(turn?.pending.map((item) => item.kind)).toEqual(['approval', 'approval']);
    expect(turn?.pending[1]?.question).toMatchObject({ command: fsCommand('write', { path: 'a.txt', content: 'x' }), mode: 'sync', timeoutMs: 120_000 });
    expect(existsSync(home(kernel, 'a.txt'))).toBe(false);
  });

  it('QA4-H11 under auto a fs call runs at once unless risky, and a denied one writes nothing', async () => {
    const { kernel, fake, sessionId } = await started(
      { 'kvcoder.shell.approval': 'auto' },
      { command: fsCommand('write', { path: 'plain.txt', content: 'plain' }) },
      { command: fsCommand('write', { path: 'risky.txt', content: 'risky' }), risky: true },
    );
    expect(readFileSync(home(kernel, 'plain.txt'), 'utf8')).toBe('plain');
    expect((await turnState(kernel, sessionId)).turn?.pending).toHaveLength(1);
    await answer(kernel, sessionId, 0, false);
    expect(toolResults(fake)).toEqual([expect.stringContaining('"created": true') as unknown, 'denied by the user']);
    expect(existsSync(home(kernel, 'risky.txt'))).toBe(false);
  });

  it('QA4-H11 an allowed risky fs call writes and returns its JSON', async () => {
    const { kernel, fake, sessionId } = await started({ 'kvcoder.shell.approval': 'auto' }, { command: fsCommand('write', { path: 'risky.txt', content: 'risky' }), risky: true });
    expect(existsSync(home(kernel, 'risky.txt'))).toBe(false);
    await answer(kernel, sessionId, 0, true);
    expect(readFileSync(home(kernel, 'risky.txt'), 'utf8')).toBe('risky');
    expect(toolResults(fake)[0]).toMatch(/^\{\n {2}"path": "risky.txt",\n {2}"created": true,\n {2}"bytes": 5\n\}\n\[exit code 0\]$/);
  });

  it('QA4-E14 fs -h never asks, even under ask', async () => {
    const { kernel, fake, sessionId } = await started({ 'kvcoder.shell.approval': 'ask' }, 'fs -h');
    expect((await turnState(kernel, sessionId)).turn?.pending).toEqual([]);
    expect(toolResults(fake)[0]).toMatch(/^fs: Create, replace/);
  });

  it('QA4-E15 the other built-in connectors never ask, even under ask', async () => {
    const { kernel, fake, sessionId } = await started({ 'kvcoder.shell.approval': 'ask' }, 'jobs list');
    expect((await turnState(kernel, sessionId)).turn?.pending).toEqual([]);
    expect(toolResults(fake)).toEqual(['[]\n[exit code 0]']);
  });

  it('QA4-E16 a risky async call asks too, and starts only when allowed', async () => {
    if (process.platform === 'win32') throw new Error('These calls are bash; Windows runs PowerShell.');
    const { kernel, sessionId } = await started({ 'kvcoder.shell.approval': 'auto' }, { command: 'sleep 30', mode: 'async', risky: true });
    expect(await kernel.exec('kvcoder.job.list', { sessionId })).toEqual([]);
    expect((await turnState(kernel, sessionId)).turn?.pending[0]?.question).toMatchObject({ mode: 'async' });
    await answer(kernel, sessionId, 0, true);
    expect(await kernel.exec('kvcoder.job.list', { sessionId })).toEqual([expect.objectContaining({ kind: 'process', status: 'running' }) as unknown]);
  });

  it('QA4-E17 a fs call waiting for approval writes nothing when the turn is cancelled', async () => {
    const { kernel, sessionId } = await started({ 'kvcoder.shell.approval': 'ask' }, fsCommand('write', { path: 'never.txt', content: 'x' }));
    await kernel.exec('kvcoder.turn.cancel', { sessionId });
    await kernel.clock.advance(0);
    expect(existsSync(home(kernel, 'never.txt'))).toBe(false);
    expect((await turnState(kernel, sessionId)).turn).toMatchObject({ outcome: 'cancelled' });
  });

  it('QA11-H4 and QA11-E4 under auto a call without risky waits for the person; risky false runs at once; under ask both wait', async () => {
    const world = await kvcoder.start({ settings: { 'kvcoder.shell.approval': 'auto' } });
    const sessionId = await newSession(world.kernel);
    world.fake.reply({ chunks: [{ toolCall: { id: 'c1', name: 'bash', arguments: { command: 'touch unmarked.txt' } } }, { toolCall: { id: 'c2', name: 'bash', arguments: { command: 'touch marked.txt', risky: false } } }] }, says('ok'));
    await world.kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await world.kernel.clock.advance(0);
    const { session, turn } = await turnState(world.kernel, sessionId);
    expect(session.status).toBe('waiting');
    expect(turn?.pending[0]?.question).toMatchObject({ command: 'touch unmarked.txt', mode: 'sync' });
    expect(turn?.pending[0]?.question).not.toHaveProperty('title');
    expect(existsSync(home(world.kernel, 'marked.txt'))).toBe(true);
    expect(existsSync(home(world.kernel, 'unmarked.txt'))).toBe(false);
    await answer(world.kernel, sessionId, 0, true);
    expect(existsSync(home(world.kernel, 'unmarked.txt'))).toBe(true);

    const asking = await started({ 'kvcoder.shell.approval': 'ask' }, { command: 'touch one.txt', risky: false }, 'touch two.txt');
    expect((await turnState(asking.kernel, asking.sessionId)).turn?.pending.map((item) => item.kind)).toEqual(['approval', 'approval']);
  });
});

