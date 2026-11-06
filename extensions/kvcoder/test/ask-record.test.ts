import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { z, type Json } from '@kvman/sdk';
import type { TestKernel } from '@kvman/testkit';
import type { FakeOpenAI } from '@kvman/testkit/fake-openai';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, requestMessages, runs, says, textOf } from './support/model-script.ts';
import { newSession } from './support/turns.ts';

const kvcoder = useKvcoder();

// `ask record` (08 §8.5, ADR 0115, 24 to 27 and 49). Takes are made here as files of the workspace by the test's own
// extension; the person's own uploads, which an answer deletes, are made over HTTP in the e2e project.

const upload = async (kernel: TestKernel, name: string, type: string, bytes: Buffer = Buffer.from('take')): Promise<string> =>
  z.object({ id: z.string() }).parse(await kernel.exec('todo.file.write', { name, base64: bytes.toString('base64'), type }, { as: '@test/todo' })).id;

const pendingSchema = z.object({ pending: z.array(z.object({ questionId: z.string().nullable(), question: z.record(z.string(), z.json()).nullable() })) });

async function pending(kernel: TestKernel, sessionId: string): Promise<{ questionId: string; question: Record<string, Json> } | undefined> {
  const [turn] = (await kernel.exec('kvcoder.turn.list', { sessionId, limit: 1 })).map((found) => pendingSchema.parse(found));
  const item = turn?.pending[0];
  return item?.questionId === null || item?.questionId === undefined || item.question === null ? undefined : { questionId: item.questionId, question: item.question };
}

async function ask(kernel: TestKernel, fake: FakeOpenAI, payload: Record<string, unknown>): Promise<string> {
  const sessionId = await newSession(kernel);
  fake.reply(runs(command('ask', 'record', payload)), says('thanks'));
  await kernel.exec('kvcoder.message.send', { sessionId, text: 'record it' });
  await kernel.clock.advance(0);
  return sessionId;
}

const twoLines = { prompt: 'Record scene 1', folder: 'videos/tour/voice-1', tone: 'warm', lines: [{ text: 'This is Notes.', stress: ['notes'], example: 'ex.mp3' }, { text: 'Sign in, then write.', pauses: ['in'], seconds: 4 }] };

const toolText = (fake: FakeOpenAI): string => requestMessages(fake).filter((message) => message.role === 'tool').map((message) => textOf(message)).join('\n');

describe('ask record (08 §8.5, ADR 0115, 49)', { timeout: 30_000 }, () => {
  it('M5.10-H1 the question keeps its examples, and the answer writes the takes into the workspace for the model', async () => {
    const { kernel, fake } = await kvcoder.start();
    writeFileSync(path.join(kernel.homeFolder, 'ex.mp3'), 'mp3');
    const sessionId = await ask(kernel, fake, twoLines);
    const asked = await pending(kernel, sessionId);
    expect(asked?.question).toMatchObject({ kind: 'record', prompt: 'Record scene 1', exampleFileIds: [expect.any(String), null] });
    const takes = [{ fileId: await upload(kernel, 'line-1.webm', 'audio/webm', Buffer.from('first')), durationMs: 2100 }, { fileId: await upload(kernel, 'line-2.m4a', 'audio/mp4', Buffer.from('second')), durationMs: 3300 }];
    await kernel.exec('kvcoder.question.answer', { questionId: asked?.questionId ?? '', answer: { takes } });
    await kernel.clock.advance(0);
    expect(readFileSync(path.join(kernel.homeFolder, 'videos/tour/voice-1/line-1.webm'), 'utf8')).toBe('first');
    expect(readFileSync(path.join(kernel.homeFolder, 'videos/tour/voice-1/line-2.m4a'), 'utf8')).toBe('second');
    expect(toolText(fake).split('\n')[0]).toBe(JSON.stringify({ takes: [{ file: 'videos/tour/voice-1/line-1.webm', durationMs: 2100 }, { file: 'videos/tour/voice-1/line-2.m4a', durationMs: 3300 }] }));
    expect(existsSync(path.join(kernel.home, 'files', takes[0]?.fileId ?? ''))).toBe(true);
  });

  it('M5.10-H2 an identical retry is acknowledged, and a skip is skipped', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await ask(kernel, fake, { prompt: 'One line', folder: 'v', lines: [{ text: 'Hello.' }] });
    const asked = await pending(kernel, sessionId);
    const answer = { takes: [{ fileId: await upload(kernel, 'a.webm', 'audio/webm'), durationMs: 900 }] };
    await kernel.exec('kvcoder.question.answer', { questionId: asked?.questionId ?? '', answer });
    await expect(kernel.exec('kvcoder.question.answer', { questionId: asked?.questionId ?? '', answer })).resolves.toMatchObject({ jobId: expect.any(String) });
    const other = await ask(kernel, fake, { prompt: 'Skip me', folder: 'v', lines: [{ text: 'Hello.' }] });
    await kernel.exec('kvcoder.question.answer', { questionId: (await pending(kernel, other))?.questionId ?? '', answer: { dismissed: true } });
    await kernel.clock.advance(0);
    expect(toolText(fake)).toContain('The person skipped this question.');
  });

  it('M5.10-E1 a stress word not in its line, a wrong example, a folder outside, or too many lines fail the call', async () => {
    const { kernel, fake } = await kvcoder.start();
    writeFileSync(path.join(kernel.homeFolder, 'notes.txt'), 'x');
    writeFileSync(path.join(kernel.homeFolder, 'big.mp3'), Buffer.alloc(10 * 1024 * 1024 + 1));
    const line = { text: 'This is Notes.' };
    const attempts: [Record<string, unknown>, string][] = [
      [{ prompt: 'p', folder: 'v', lines: [{ ...line, stress: ['apps'] }] }, 'VALIDATION_FAILED'],
      [{ prompt: 'p', folder: 'v', lines: [{ ...line, example: 'notes.txt' }] }, 'VALIDATION_FAILED'],
      [{ prompt: 'p', folder: 'v', lines: [{ ...line, example: 'big.mp3' }] }, 'VALIDATION_FAILED'],
      [{ prompt: 'p', folder: 'v', lines: [{ ...line, example: 'gone.mp3' }] }, 'NOT_FOUND'],
      [{ prompt: 'p', folder: '../outside', lines: [line] }, 'VALIDATION_FAILED'],
      [{ prompt: 'p', folder: 'v', lines: Array.from({ length: 21 }, () => line) }, 'VALIDATION_FAILED'],
    ];
    for (const [payload, code] of attempts) {
      const sessionId = await ask(kernel, fake, payload);
      expect(toolText(fake)).toMatch(new RegExp(`^error ${code}: `));
      expect(await pending(kernel, sessionId)).toBeUndefined();
    }
  });

  it('M5.13-H13 a run of words to stress and to pause after is asked', async () => {
    const { kernel, fake } = await kvcoder.start();
    const text = 'والفريق الطبي يقدر يوثّق بيانات الزيارة في السجل الطبي للمريض.';
    const sessionId = await ask(kernel, fake, { prompt: 'p', folder: 'v', lines: [{ text, stress: ['السجل الطبي'], pauses: ['بيانات الزيارة'] }] });
    expect((await pending(kernel, sessionId))?.question).toMatchObject({ lines: [{ text, stress: ['السجل الطبي'], pauses: ['بيانات الزيارة'] }] });
  });

  it('M5.13-E8 a run that is not whole words of the line fails and says why', async () => {
    const { kernel, fake } = await kvcoder.start();
    for (const run of ['الفريق الطبي', 'الطبي والفريق']) {
      const sessionId = await ask(kernel, fake, { prompt: 'p', folder: 'v', lines: [{ text: 'والفريق الطبي يقدر يوثّق', stress: [run] }] });
      expect(toolText(fake)).toContain(`error VALIDATION_FAILED: "${run}" isn't found as whole words of the line`);
      expect(await pending(kernel, sessionId)).toBeUndefined();
    }
  });

  it('M5.13-E9 a run matches across any spacing of the line', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await ask(kernel, fake, { prompt: 'p', folder: 'v', lines: [{ text: 'Open  the notes', stress: ['Open the'] }] });
    expect(await pending(kernel, sessionId)).toBeDefined();
  });

  it('M5.10-E2 takes that are missing, not sound, or not files fail and nothing is written (one too large: the e2e project)', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await ask(kernel, fake, { prompt: 'Two lines', folder: 'v', lines: [{ text: 'One.' }, { text: 'Two.' }] });
    const questionId = (await pending(kernel, sessionId))?.questionId ?? '';
    const sound = await upload(kernel, 'a.webm', 'audio/webm');
    const answers = [
      { takes: [{ fileId: sound, durationMs: 900 }] },
      { takes: [{ fileId: sound, durationMs: 900 }, { fileId: await upload(kernel, 'a.png', 'image/png'), durationMs: 900 }] },
      { takes: [{ fileId: sound, durationMs: 900 }, { fileId: 'nope', durationMs: 900 }] },
    ];
    for (const answer of answers) await expect(kernel.exec('kvcoder.question.answer', { questionId, answer })).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
    expect(existsSync(path.join(kernel.homeFolder, 'v', 'line-2.webm'))).toBe(false);
    expect(await pending(kernel, sessionId)).toMatchObject({ questionId });
  });
});
