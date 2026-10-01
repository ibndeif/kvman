import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from '@kvman/sdk';
import { calls, says } from '../support/model-script.ts';
import { childWait, kvmanWorld, until, type KvmanWorld } from '../support/kvman-child.ts';

let world: KvmanWorld | undefined;

afterEach(async () => {
  await world?.close();
  world = undefined;
});

const sessionSchema = z.object({ id: z.string(), status: z.string(), stepJobId: z.string().optional() });
const turnsSchema = z.array(z.object({ outcome: z.string().optional(), pending: z.array(z.object({ questionId: z.string().nullable() })) }));
const messagesSchema = z.object({ messages: z.array(z.object({ kind: z.string(), content: z.record(z.string(), z.unknown()) })) });
const jobSchema = z.object({ ok: z.literal(true), job: z.object({ status: z.string(), problem: z.object({ code: z.string() }).optional() }) });

describe('crash invariants 3 and 5 (12 §12.2)', { timeout: 120_000 }, () => {
  it('M2.4-H13 a suspended turn and its question survive a SIGKILL, and a step cut off by it ends interrupted', async () => {
    world = await kvmanWorld();
    const { fake } = world;
    const first = await world.start();
    const create = async (title: string) => sessionSchema.parse(await first.call('commands', 'kvcoder.session.create', { title })).id;
    const waiting = await create('Waiting');
    const held = await create('Held');
    fake.reply(calls(`ask text '{"prompt":"Name?"}'`));
    await first.call('commands', 'kvcoder.message.send', { sessionId: waiting, text: 'go' });
    await until(() => first.call('queries', 'kvcoder.session.get', { sessionId: waiting }), sessionSchema, (session) => session.status === 'waiting');
    fake.reply({ chunks: [{ text: 'Thinking about it' }, { wait: new Promise<void>(() => undefined) }] });
    await first.call('commands', 'kvcoder.message.send', { sessionId: held, text: 'go' });
    await vi.waitFor(() => expect(fake.requests()).toHaveLength(2), childWait);
    const heldStep = String(sessionSchema.parse(await first.call('queries', 'kvcoder.session.get', { sessionId: held })).stepJobId);
    await first.kill();

    const second = await world.start();
    const [turn] = turnsSchema.parse(await second.call('queries', 'kvcoder.turn.list', { sessionId: waiting, limit: 1 }));
    expect(sessionSchema.parse(await second.call('queries', 'kvcoder.session.get', { sessionId: waiting })).status).toBe('waiting');
    const questionId = String(turn?.pending[0]?.questionId);
    fake.reply(says('Nice to meet you, Ada.'));
    await second.call('commands', 'kvcoder.question.answer', { questionId, answer: { text: 'Ada' } });
    await until(() => second.call('queries', 'kvcoder.turn.list', { sessionId: waiting, limit: 1 }), turnsSchema, (turns) => turns[0]?.outcome === 'done');

    const job = jobSchema.parse(await (await fetch(`${second.origin}/api/jobs/${heldStep}`)).json()).job;
    expect(job).toMatchObject({ status: 'failed', problem: { code: 'INTERRUPTED' } });
    const turns = await until(() => second.call('queries', 'kvcoder.turn.list', { sessionId: held, limit: 1 }), turnsSchema, (found) => found[0]?.outcome !== undefined);
    expect(turns[0]?.outcome).toBe('interrupted');
    expect(sessionSchema.parse(await second.call('queries', 'kvcoder.session.get', { sessionId: held })).status).toBe('idle');
    const { messages } = messagesSchema.parse(await second.call('queries', 'kvcoder.message.list', { sessionId: held, limit: 10 }));
    expect(messages.at(-1)).toMatchObject({ kind: 'notice', content: { code: 'INTERRUPTED' } });
  });
});
