import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { entry, gateEntry, openGate, reloadWait, revisionOf, useHarness } from '../extension-folders.ts';

const harness = useHarness();

const source = (answer: string, extra = '') =>
  entry(`${gateEntry}
  ctx.registerCommand('r.hold', { description: 'Waits, then answers.', input: z.object({}), output: z.string(), public: true,
    handle: async () => { await gate('m16-reload-hold'); return '${answer}'; } });
  ctx.registerQuery('r.answer', { description: 'Answers.', input: z.object({}), output: z.string(), public: true, handle: () => '${answer}' });
  ${extra}`);

const reloaded = { name: '@test/r', namespace: 'r', entry: source('old') };
const neighbour = { name: '@test/n', namespace: 'n', entry: entry('') };
const index = (name: string) => path.join(harness.folder(name), 'index.ts');
const reloadLines = (kernel: Parameters<typeof harness.logLines>[0], message: string) => harness.logLines(kernel).filter((line) => line['msg'] === message);

describe('hot reload (02 §2.9)', () => {
  it('M1.6-H7 an edit serves new registrations while a running job finishes on the old code', async () => {
    const kernel = await harness.start([reloaded]);
    const first = openGate('m16-reload-hold');
    const oldJob = await kernel.execAsync('r.hold', {});
    await first.waiting;
    writeFileSync(index('@test/r'), source('new', `ctx.registerQuery('r.added', { description: 'Is new.', input: z.object({}), output: z.string(), public: true, handle: () => 'added' });`));
    await vi.waitFor(async () => expect(await revisionOf(kernel, '@test/r')).toBe(1), reloadWait);
    expect(await kernel.exec('r.added', {})).toBe('added');
    expect(await kernel.exec('r.answer', {})).toBe('new');
    first.release();
    expect(await kernel.waitForJob(oldJob)).toMatchObject({ status: 'succeeded', output: 'old' });
    const second = openGate('m16-reload-hold');
    const newJob = await kernel.execAsync('r.hold', {});
    await second.waiting;
    second.release();
    expect(await kernel.waitForJob(newJob)).toMatchObject({ status: 'succeeded', output: 'new' });
  });

  it('M1.6-H8 a broken edit keeps the old code', async () => {
    const kernel = await harness.start([reloaded]);
    writeFileSync(index('@test/r'), entry("throw new Error('broken on purpose');"));
    await vi.waitFor(() => expect(reloadLines(kernel, 'extension reload failed')).toHaveLength(1), reloadWait);
    expect(reloadLines(kernel, 'extension reload failed')[0]).toMatchObject({ extension: '@test/r', code: 'EXTENSION_INVALID' });
    expect(await kernel.exec('r.answer', {})).toBe('old');
    expect(await revisionOf(kernel, '@test/r')).toBe(0);
  });

  it('M1.6-E23 three files written at once make one reload', async () => {
    const kernel = await harness.start([reloaded, neighbour]);
    writeFileSync(index('@test/r'), source('new'));
    writeFileSync(path.join(harness.folder('@test/r'), 'a.txt'), 'a');
    writeFileSync(path.join(harness.folder('@test/r'), 'b.txt'), 'b');
    await vi.waitFor(async () => expect(await revisionOf(kernel, '@test/r')).toBe(1), reloadWait);
    // A later reload of another extension would carry any straggling event of the batch along with it.
    writeFileSync(index('@test/n'), entry('// edited'));
    await vi.waitFor(async () => expect(await revisionOf(kernel, '@test/n')).toBe(1), reloadWait);
    expect(await revisionOf(kernel, '@test/r')).toBe(1);
    expect(reloadLines(kernel, 'extension reloaded').map((line) => line['extension'])).toEqual(['@test/r', '@test/n']);
  });

  it('M1.6-E24 a change inside node_modules does not reload', async () => {
    const kernel = await harness.start([reloaded, neighbour]);
    const modules = path.join(harness.folder('@test/r'), 'node_modules');
    mkdirSync(modules);
    writeFileSync(path.join(modules, 'dependency.js'), 'export {};');
    // Both changes land in one batch, so a node_modules event that counted would reload @test/r along with @test/n.
    writeFileSync(index('@test/n'), entry('// edited'));
    await vi.waitFor(async () => expect(await revisionOf(kernel, '@test/n')).toBe(1), reloadWait);
    expect(await revisionOf(kernel, '@test/r')).toBe(0);
  });
});
