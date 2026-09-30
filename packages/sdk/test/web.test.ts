import { readFileSync } from 'node:fs';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { Json, Workspace } from '../src/index.ts';
import type { Kvman, StreamEvent, View } from '../src/web.ts';

declare module '../src/registry.ts' {
  interface Commands {
    'webnotes.add': { input: { text: string }; output: { id: string } };
  }
}

// Type-checked by `pnpm typecheck`; never run.
async function componentCalls(kvman: Kvman): Promise<void> {
  expectTypeOf(kvman.exec<'webnotes.add'>).parameter(1).toEqualTypeOf<{ text: string }>();
  expectTypeOf(await kvman.exec('webnotes.add', { text: 'hi' })).toEqualTypeOf<{ id: string }>();
  expectTypeOf(await kvman.execAsync('webnotes.add', { text: 'hi' })).toEqualTypeOf<string>();
  expectTypeOf(kvman.workspace.value).toEqualTypeOf<Workspace>();
  for await (const event of kvman.stream('01900000-0000-7000-8000-000000000000')) {
    if (event.type === 'progress') expectTypeOf(event.data).toEqualTypeOf<Json>();
  }
}

describe('@kvman/sdk/web (03 §3.2)', () => {
  it('M2.3-E17 the web subpath is types only and exported', async () => {
    const module: Record<string, unknown> = await import('../src/web.ts');
    expect(Object.keys(module)).toEqual([]);
    const manifest: unknown = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    expect(manifest).toMatchObject({ exports: { './web': { types: './dist/web.d.ts', default: './dist/web.js' } } });
    expectTypeOf<StreamEvent>().toHaveProperty('type');
    expectTypeOf<Extract<View, { type: 'custom' }>>().toEqualTypeOf<{ type: 'custom'; component: string; props: Record<string, Json> }>();
    expectTypeOf(componentCalls).toBeFunction();
  });
});
