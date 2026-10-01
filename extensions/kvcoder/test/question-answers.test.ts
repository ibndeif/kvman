import { describe, expect, it } from 'vitest';
import type { Json } from '@kvman/sdk';
import { useKvcoder, type World } from './support/kvcoder-kernel.ts';
import { calls, says, toolResults } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';

const kvcoder = useKvcoder();

async function asked(world: World, line: string): Promise<{ sessionId: string; questionId: string }> {
  const sessionId = await newSession(world.kernel);
  world.fake.reply(calls(line), says('ok'));
  await world.kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  await world.kernel.clock.advance(0);
  return { sessionId, questionId: String((await turnState(world.kernel, sessionId)).turn?.pending[0]?.questionId) };
}

const choice = (multiple: boolean, other: boolean) =>
  `ask choice '${JSON.stringify({ prompt: 'Which?', multiple, options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], ...(other ? { other: true } : {}) })}'`;

describe('answers (ADR 0009, 102)', { timeout: 30_000 }, () => {
  it('M2.4-E23 answers are checked against their question, and a missing question fails QUESTION_NOT_FOUND', async () => {
    const world = await kvcoder.start();
    const answer = (questionId: string, value: Json) => world.kernel.exec('kvcoder.question.answer', { questionId, answer: value });
    const single = await asked(world, choice(false, false));
    for (const wrong of [{ text: 'x' }, { selected: ['c'] }, { selected: ['a', 'b'] }, { selected: [], other: 'mine' }]) {
      await expect(answer(single.questionId, wrong), JSON.stringify(wrong)).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
    }
    await answer(single.questionId, { selected: ['b'] });
    await expect(answer(single.questionId, { selected: ['b'] })).rejects.toMatchObject({ problem: { code: 'kvcoder/QUESTION_NOT_FOUND' } });
    await expect(answer('nope', { text: 'x' })).rejects.toMatchObject({ problem: { code: 'kvcoder/QUESTION_NOT_FOUND' } });
    await world.kernel.clock.advance(0);
    const many = await asked(world, choice(true, true));
    await answer(many.questionId, { selected: ['a', 'b'], other: 'c too' });
    await world.kernel.clock.advance(0);
    expect(toolResults(world.fake)).toEqual(['{\n  "selected": [\n    "a",\n    "b"\n  ],\n  "other": "c too"\n}\n[exit code 0]']);
    const skipped = await asked(world, `ask text '{"prompt":"Name?"}'`);
    await answer(skipped.questionId, { dismissed: true });
    await world.kernel.clock.advance(0);
    expect(toolResults(world.fake)).toEqual(['{\n  "dismissed": true\n}\n[exit code 0]']);
  });

  it('M2.4-E10 an extension answering a question fails NOT_PUBLIC', async () => {
    const world = await kvcoder.start();
    const { questionId } = await asked(world, `ask text '{"prompt":"Name?"}'`);
    await expect(world.kernel.exec('kvcoder.question.answer', { questionId, answer: { text: 'x' } }, { as: '@test/todo' })).rejects.toMatchObject({ problem: { code: 'NOT_PUBLIC' } });
  });

  it("M2.4-E24 an ask call with invalid input returns an error result and doesn't suspend", async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(calls(`ask choice '{"prompt":"Which?","multiple":false,"options":[{"id":"a","label":"A"}]}'`), says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    expect(toolResults(fake)).toEqual([expect.stringMatching(/^error VALIDATION_FAILED: options: .*\n\[exit code 1\]$/) as unknown]);
    expect((await turnState(kernel, sessionId)).turn).toMatchObject({ outcome: 'done' });
  });
});
