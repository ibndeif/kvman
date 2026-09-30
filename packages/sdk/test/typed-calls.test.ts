import { describe, expectTypeOf, it } from 'vitest';
import type { Ctx, InputOf, OutputOf } from '../src/index.ts';

declare module '../src/registry.ts' {
  interface Commands {
    'notes.add': { input: { text: string }; output: { id: string } };
  }
  interface Queries {
    'notes.list': { input: { limit: number }; output: { id: string; text: string }[] };
  }
  interface Settings {
    'notes.greeting': string;
  }
}

// Type-checked by `pnpm typecheck`; the handlers are never run.
async function declaredCalls(ctx: Ctx): Promise<void> {
  expectTypeOf(ctx.exec<'notes.add'>).parameter(1).toEqualTypeOf<{ text: string }>();
  expectTypeOf(await ctx.exec('notes.add', { text: 'hi' })).toEqualTypeOf<{ id: string }>();
  expectTypeOf(ctx.exec<'notes.list'>).parameter(1).toEqualTypeOf<{ limit: number }>();
  expectTypeOf(await ctx.exec('notes.list', { limit: 10 })).toEqualTypeOf<{ id: string; text: string }[]>();
  expectTypeOf(ctx.execAsync<'notes.add'>).parameter(1).toEqualTypeOf<{ text: string }>();
  expectTypeOf(ctx.schedule<'notes.add'>).parameter(1).toEqualTypeOf<{ text: string }>();
  expectTypeOf(await ctx.settings.get('notes.greeting')).toEqualTypeOf<string>();
}

async function undeclaredCalls(ctx: Ctx): Promise<void> {
  expectTypeOf(ctx.exec<'other.thing'>).parameter(1).toBeUnknown();
  expectTypeOf(await ctx.exec('other.thing', 42)).toBeUnknown();
  expectTypeOf(ctx.execAsync<'other.thing'>).parameter(1).toBeUnknown();
  expectTypeOf(await ctx.settings.get('other.key')).toBeUnknown();
}

describe('typed calls (03 §3.2)', () => {
  it('M1.2-H4 a declared command gives typed input and output; an undeclared name is unknown', () => {
    expectTypeOf<InputOf<'notes.add'>>().toEqualTypeOf<{ text: string }>();
    expectTypeOf<OutputOf<'notes.add'>>().toEqualTypeOf<{ id: string }>();
    expectTypeOf<InputOf<'other.thing'>>().toBeUnknown();
    expectTypeOf<OutputOf<'other.thing'>>().toBeUnknown();
    expectTypeOf(undeclaredCalls).toBeFunction();
  });

  it('M1.2-E15 queries, execAsync, schedule, and settings are typed too', () => {
    expectTypeOf(declaredCalls).toBeFunction();
  });
});
