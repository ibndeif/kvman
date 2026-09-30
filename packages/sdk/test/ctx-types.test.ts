import { describe, expectTypeOf, it } from 'vitest';
import { z, type Caller, type Ctx, type Filter, type Problem, type Stored } from '../src/index.ts';

const task = z.object({ title: z.string(), done: z.boolean(), tags: z.array(z.string()) });

// The entry of 03 §3.1, with the collection schema of ADR 0009, 4.
const note = z.object({ text: z.string() });

const extension = (ctx: Ctx): void => {
  ctx.registerCommand('notes.add', {
    description: 'Adds a note to this workspace.',
    input: z.object({ text: z.string() }),
    output: z.object({ id: z.string() }),
    public: true,
    handle: async (input) => {
      const stored = await ctx.store.collection('notes', note).insert({ text: input.text });
      return { id: stored.id };
    },
  });

  ctx.registerQuery('notes.list', {
    description: 'Lists the notes of this workspace.',
    input: z.object({ limit: z.number().int().max(1000) }),
    output: z.array(z.object({ id: z.string(), text: z.string() })),
    public: true,
    handle: (input) => ctx.store.collection('notes', note).find({}, { limit: input.limit }),
  });

  ctx.registerSetting('notes.greeting', { description: 'The greeting shown above notes.', schema: z.string(), default: 'Hello' });
};

async function collectionTypes(ctx: Ctx): Promise<void> {
  const tasks = ctx.store.collection('tasks', task);
  expectTypeOf(await tasks.get('id')).toEqualTypeOf<Stored<{ title: string; done: boolean; tags: string[] }> | undefined>();
  expectTypeOf<Filter<z.infer<typeof task>>>().toEqualTypeOf<{ title?: string; done?: boolean; tags?: never }>();
}

const handlers = (ctx: Ctx): void => {
  ctx.registerHandler('kernel.job.failed', {
    description: 'Records failed jobs.',
    handle: (info) => {
      expectTypeOf(info).toEqualTypeOf<{ jobId: string; rootId: string; name: string; caller: Caller; workspaceId: string } & { problem: Problem; attempts: number }>();
    },
  });
  ctx.registerHandler('kernel.workspace.opened', {
    description: 'Greets a new workspace.',
    handle: (info) => {
      expectTypeOf(info).toEqualTypeOf<{ workspaceId: string }>();
    },
  });
};

describe('the ctx types (03)', () => {
  it('M1.2-E16 the entry of 03 §3.1 type-checks, and collections are typed from their schema', () => {
    expectTypeOf(extension).toEqualTypeOf<(ctx: Ctx) => void>();
    expectTypeOf(collectionTypes).toBeFunction();
  });

  it('M1.2-E17 handlers receive the input of their point', () => {
    expectTypeOf(handlers).toBeFunction();
  });
});
