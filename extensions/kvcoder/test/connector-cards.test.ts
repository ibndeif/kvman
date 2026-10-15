import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { todo, useKvcoder, type FixtureExtension } from './support/kvcoder-kernel.ts';
import { command, runs, says } from './support/model-script.ts';
import { newSession } from './support/turns.ts';

const kvcoder = useKvcoder();

const notesEntry = `import { z, type Ctx } from '@kvman/sdk';

export default (ctx: Ctx): void => {
  ctx.registerQuery('notes.item.get', { description: 'Gives one note.', input: z.object({ id: z.string() }), output: z.object({ title: z.string() }), public: true, handle: () => ({ title: 'Milk' }) });
  ctx.registerQuery('notes.item.fail', { description: 'Always fails.', input: z.object({}), output: z.object({}), public: true, handle: () => { throw ctx.problem('notes/BROKEN'); } });
  ctx.registerHandler('kernel.started', {
    description: 'Registers the notes connector with its card.',
    handle: async () => {
      await ctx.exec('kvcoder.connector.register', { name: 'notes', description: 'Notes.', commands: [{ name: 'show', command: 'notes.item.get', card: 'notes.item-card' }, { name: 'broken', command: 'notes.item.fail', card: 'notes.item-card' }] });
    },
  });
};
`;

const notes: FixtureExtension = { name: '@test/notes', namespace: 'notes', entry: notesEntry, dependencies: { '@kvman/kvcoder': '^0.1.0' } };

const resultSchema = z.object({ kind: z.literal('toolResult'), content: z.object({ details: z.json().nullable().optional(), isError: z.boolean() }).loose() }).loose();
const results = async (kernel: Awaited<ReturnType<typeof kvcoder.start>>['kernel'], sessionId: string) =>
  (await kernel.exec('kvcoder.message.list', { sessionId, limit: 50 })).messages.flatMap((message) => {
    const parsed = resultSchema.safeParse(message);
    return parsed.success ? [parsed.data.content] : [];
  });

describe("an extension's result card (08 §8.4, ADR 0082, 13)", { timeout: 30_000 }, () => {
  it("QA52-H14 a successful call of a command with a card stores the card with the payload and the command's output", async () => {
    const { kernel, fake } = await kvcoder.start({ extensions: [todo, notes] });
    const sessionId = await newSession(kernel);
    fake.reply(runs(command('notes', 'show', { id: 'n1' })), says('shown'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'show it' });
    await kernel.clock.advance(0);
    const [result] = await results(kernel, sessionId);
    expect(result?.isError).toBe(false);
    expect(result?.details).toMatchObject({ card: { component: 'notes.item-card', payload: { id: 'n1' }, output: { title: 'Milk' } } });
    const listed = (await kernel.exec('kvcoder.connector.list', {})).find((connector) => connector.name === 'notes');
    expect(listed?.commands?.[0]).toMatchObject({ name: 'show', query: true, card: 'notes.item-card' });
  });

  it('QA52-E10 a card of another namespace fails VALIDATION_FAILED and stores nothing', async () => {
    const { kernel } = await kvcoder.start({ extensions: [todo, notes] });
    const register = kernel.exec('kvcoder.connector.register', { name: 'stray', description: 'Stray.', commands: [{ name: 'show', command: 'notes.item.get', card: 'other.card' }] }, { as: '@test/notes' });
    await expect(register).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
    expect((await kernel.exec('kvcoder.connector.list', {})).some((connector) => connector.name === 'stray')).toBe(false);
  });

  it('QA52-E11 a failed call of a command with a card stores no card', async () => {
    const { kernel, fake } = await kvcoder.start({ extensions: [todo, notes] });
    const sessionId = await newSession(kernel);
    fake.reply(runs(command('notes', 'broken', {})), says('it broke'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'break it' });
    await kernel.clock.advance(0);
    const [result] = await results(kernel, sessionId);
    expect(result?.isError).toBe(true);
    expect(JSON.stringify(result?.details ?? null)).not.toContain('"card"');
  });
});
