import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useKvbuilder } from '../support/kvbuilder-kernel.ts';
import { npmEnvironment } from '../support/npm-environment.ts';

const kvbuilder = useKvbuilder();
const saved = { ...process.env };
beforeEach(() => Object.assign(process.env, npmEnvironment()));
afterEach(() => {
  for (const key of Object.keys(process.env)) { if (!(key in saved)) delete (process.env as Record<string, string | undefined>)[key]; }
  Object.assign(process.env, saved);
});

function edit(file: string, from: string, to: string): void {
  const text = readFileSync(file, 'utf8');
  if (!text.includes(from)) throw new Error(`${file} has no ${from}`);
  writeFileSync(file, text.replace(from, to));
}

describe('ext check and ext test of a scaffold (09 §9.1, ADR 0009, 116, 117, 126)', () => {
  it('M2.5-E9 a fresh scaffold checks clean; a type error comes first, then the check findings', async () => {
    const world = await kvbuilder.start();
    await world.kernel.exec('kvbuilder.ext.new', { name: 'notes', namespace: 'notes', folder: 'notes' });
    expect(await world.kernel.exec('kvbuilder.ext.check', { folder: 'notes' })).toEqual([]);
    const source = path.join(world.workspace, 'notes', 'src', 'index.ts');
    edit(source, "handle: () => ({ text: 'Hello from notes!' }),", "handle: () => ({ text: 'Hello from notes!' }),\n  });\n  const count: number = 'many';\n  ctx.registerQuery('notes.count.get', { description: 'Gives the count.', public: true, input: z.object({}), output: z.number(), handle: () => count,");
    edit(path.join(world.workspace, 'notes', 'locales', 'ar.json'), '"notes.pages.hello": "مرحبا"', '"notes.pages.other": "مرحبا"');
    expect(await world.kernel.exec('kvbuilder.ext.check', { folder: 'notes' })).toEqual([
      { file: expect.stringMatching(/^src\/index\.ts:\d+:\d+$/), message: expect.stringMatching(/^TS2322: /), hint: expect.any(String) },
      { file: 'locales/en.json', message: 'locales/en.json lacks notes.pages.other, which locales/ar.json has.', hint: expect.any(String) },
      { file: 'locales/ar.json', message: 'locales/ar.json lacks notes.pages.hello, which locales/en.json has.', hint: expect.any(String) },
    ]);
  });

  it('M2.5-E10 a fresh scaffold passes its test; a failing assertion fails it and names the test', async () => {
    const world = await kvbuilder.start();
    await world.kernel.exec('kvbuilder.ext.new', { name: 'notes', namespace: 'notes', folder: 'notes' });
    expect(await world.kernel.exec('kvbuilder.ext.test', { folder: 'notes' })).toEqual({ passed: true, exitCode: 0, output: expect.stringContaining('pass 2') });
    edit(path.join(world.workspace, 'notes', 'test', 'extension.test.ts'), "{ text: 'Hello from notes!' }", "{ text: 'Goodbye' }");
    const failed = await world.kernel.exec('kvbuilder.ext.test', { folder: 'notes' });
    expect(failed).toMatchObject({ passed: false, exitCode: 1 });
    expect(failed.output).toContain('notes.greeting.get gives the greeting');
  });
});
