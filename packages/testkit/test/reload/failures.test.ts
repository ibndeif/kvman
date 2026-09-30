import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { z } from '@kvman/sdk';
import type { TestKernel } from '../../src/index.ts';
import { entry, reloadWait, revisionOf, useHarness } from '../extension-folders.ts';

const harness = useHarness();

const ping = `ctx.registerQuery('a.ping', { description: 'Answers.', input: z.object({}), output: z.string(), public: true, handle: () => 'pong' });`;
const thing = `ctx.registerQuery('a.thing', { description: 'Is a thing.', input: z.object({}), output: z.string(), public: true, handle: () => 'thing' });`;
const first = { name: '@test/a', namespace: 'a', entry: entry(ping + thing) };
const second = {
  name: '@test/b',
  namespace: 'b',
  dependencies: { '@test/a': '^0.1.0' },
  entry: entry(`ctx.registerQuery('b.call', { description: 'Calls a.', input: z.object({}), output: z.unknown(), public: true, handle: () => ctx.exec('a.thing', {}) });`),
};

const manifestSchema = z.looseObject({ version: z.string(), kvman: z.looseObject({ namespace: z.string() }) });

function editManifest(name: string, change: (manifest: z.infer<typeof manifestSchema>) => z.infer<typeof manifestSchema>): void {
  const file = path.join(harness.folder(name), 'package.json');
  writeFileSync(file, JSON.stringify(change(manifestSchema.parse(JSON.parse(readFileSync(file, 'utf8'))))));
}

async function reloadFails(kernel: TestKernel, code: string): Promise<void> {
  const failures = () => harness.logLines(kernel).filter((line) => line['msg'] === 'extension reload failed');
  await vi.waitFor(() => expect(failures()).toHaveLength(1), reloadWait);
  expect(failures()[0]).toMatchObject({ extension: '@test/a', code });
  expect(await kernel.exec('a.ping', {})).toBe('pong');
  expect(await revisionOf(kernel, '@test/a')).toBe(0);
}

describe('hot reload failures (02 §2.9, ADR 0009, 26)', () => {
  it('M1.6-E25 an edit that takes a namespace another extension holds fails, and the old code serves', async () => {
    const kernel = await harness.start([first, second]);
    editManifest('@test/a', (manifest) => ({ ...manifest, kvman: { ...manifest.kvman, namespace: 'b' } }));
    await reloadFails(kernel, 'EXTENSION_INVALID');
  });

  it('M1.6-E26 a version a dependent no longer accepts, and a dropped name, only warn', async () => {
    const kernel = await harness.start([first, second]);
    editManifest('@test/a', (manifest) => ({ ...manifest, version: '2.0.0' }));
    writeFileSync(path.join(harness.folder('@test/a'), 'index.ts'), entry(ping));
    await vi.waitFor(async () => expect(await revisionOf(kernel, '@test/a')).toBe(1), reloadWait);
    const warnings = harness.logLines(kernel).filter((line) => line['level'] === 40);
    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ msg: 'A reloaded extension no longer satisfies a dependent.', extension: '@test/b', dependency: '@test/a' }),
        expect.objectContaining({ msg: 'A reloaded extension dropped a name its dependents may call.', name: 'a.thing', dependents: ['@test/b'] }),
      ]),
    );
    await expect(kernel.exec('b.call', {})).rejects.toMatchObject({ problem: { code: 'NOT_FOUND' } });
  });

  it('M1.6-E27 an edit that adds a setting the preset must set, but doesn\'t, fails', async () => {
    const kernel = await harness.start([first, second]);
    writeFileSync(path.join(harness.folder('@test/a'), 'index.ts'), entry(ping + thing + "ctx.registerSetting('a.required', { description: 'Must be set.', schema: z.string() });"));
    await reloadFails(kernel, 'VALIDATION_FAILED');
  });
});
