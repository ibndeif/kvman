import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import type { TestKernel } from '@kvman/testkit';
import type { FakeOpenAI } from '@kvman/testkit/fake-openai';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { says } from './support/model-script.ts';
import { newSession } from './support/turns.ts';

const kvcoder = useKvcoder();

async function turns(kernel: TestKernel, fake: FakeOpenAI, sessionId: string, count: number): Promise<void> {
  for (let index = 1; index <= count; index += 1) {
    fake.reply(says(`answer ${index}`));
    await kernel.exec('kvcoder.message.send', { sessionId, text: `message ${index}` });
    await kernel.clock.advance(0);
  }
}

const fileSchema = z.object({ name: z.string(), text: z.string() });

const exportSchema = z.object({ session: z.object({ id: z.string() }), turns: z.array(z.unknown()), messages: z.array(z.object({ kind: z.string() })), subagents: z.array(z.unknown()) });

describe('fork and export (08 §8.6, ADR 0009, 103)', { timeout: 30_000 }, () => {
  it("M2.4-E7 fork copies the messages through a seq and the summary, not per-session sections, and fires the point", async () => {
    const { kernel, fake } = await kvcoder.start();
    await kernel.exec('kvcoder.handler.register', { point: 'kvcoder.session.forked', command: 'todo.seen' }, { as: '@test/todo' });
    const sessionId = await newSession(kernel);
    await kernel.exec('kvcoder.section.set', { id: 'mine', title: 'Mine', order: 1, content: 'x', sessionId }, { as: '@test/todo' });
    await turns(kernel, fake, sessionId, 6);
    fake.reply(says('SUMMARY'));
    await kernel.exec('kvcoder.session.compact', { sessionId });
    const early = await kernel.exec('kvcoder.session.fork', { sessionId, throughSeq: 3 });
    expect((await kernel.exec('kvcoder.message.list', { sessionId: early.id, limit: 100 })).messages.map((message) => message.seq)).toEqual([0, 1, 2, 3]);
    const whole = await kernel.exec('kvcoder.session.fork', { sessionId });
    const copied = (await kernel.exec('kvcoder.message.list', { sessionId: whole.id, limit: 100 })).messages;
    expect(copied).toHaveLength(13);
    expect(copied.at(-1)).toMatchObject({ kind: 'summary', content: { text: 'SUMMARY', coversThroughSeq: 1 } });
    expect(whole).toMatchObject({ title: 'Test', model: 'fake/m1' });
    expect((await kernel.exec('kvcoder.section.list', { sessionId: whole.id })).map((section) => section.id)).not.toContain('mine');
    await kernel.clock.advance(0);
    expect(await kernel.exec('todo.seen.list', {})).toEqual([
      { fromSessionId: sessionId, toSessionId: early.id, throughSeq: 3 },
      { fromSessionId: sessionId, toSessionId: whole.id, throughSeq: 12 },
    ]);
  });

  it('M2.4-E8 export writes the session, its turns and messages, and its subagents to a file named from the title', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = (await kernel.exec('kvcoder.session.create', { title: 'Plan: a/b "c" <d>*' })).id;
    await turns(kernel, fake, sessionId, 1);
    const { fileId } = await kernel.exec('kvcoder.session.export', { sessionId });
    const file = fileSchema.parse(await kernel.exec('todo.file.read', { id: fileId }, { as: '@test/todo' }));
    expect(file.name).toBe('Plan- a-b -c- -d--.json');
    const data = exportSchema.parse(JSON.parse(file.text));
    expect(data.session.id).toBe(sessionId);
    expect(data.turns).toHaveLength(1);
    expect(data.messages.map((message) => message.kind)).toEqual(['user', 'assistant']);
    expect(data.subagents).toEqual([]);
    const [welcome] = (await kernel.exec('kvcoder.session.list', { limit: 10 })).filter((session) => typeof session.title !== 'string');
    const welcomeFile = await kernel.exec('kvcoder.session.export', { sessionId: String(welcome?.id) });
    expect(fileSchema.parse(await kernel.exec('todo.file.read', { id: welcomeFile.fileId }, { as: '@test/todo' })).name).toBe(`${String(welcome?.id)}.json`);
  });
});
