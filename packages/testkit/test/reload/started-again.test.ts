import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { countingEntry, reloadWait, revisionOf, useHarness, type TestExtension } from '../extension-folders.ts';

const harness = useHarness();

const counted = (namespace: string, dependencies: Record<string, string> = {}, extra = ''): TestExtension => ({
  name: `@test/${namespace}`,
  namespace,
  dependencies,
  entry: countingEntry(
    namespace,
    `ctx.registerHandler('kernel.started', { description: 'Counts starts.', handle: async () => { await bump('started'); ctx.log.info('started ran', { entry: '${namespace}' }); } });
  ${extra}`,
  ),
});

describe('kernel.started after a reload (02 §2.9, §2.15)', () => {
  it('M1.6-H9 a reload reruns the handlers of the extension and its dependents in order, and raises its revision', async () => {
    const kernel = await harness.start([counted('a'), counted('b', { '@test/a': '^0.1.0' }), counted('c')]);
    const starts = (namespace: string) => kernel.exec(`${namespace}.count-get`, { key: 'started' });
    writeFileSync(path.join(harness.folder('@test/a'), 'index.ts'), counted('a', {}, '// edited').entry);
    await vi.waitFor(async () => expect([await starts('a'), await starts('b')]).toEqual([2, 2]), reloadWait);
    expect(await starts('c')).toBe(1);
    expect([await revisionOf(kernel, '@test/a'), await revisionOf(kernel, '@test/b'), await revisionOf(kernel, '@test/c')]).toEqual([1, 0, 0]);
    const order = harness.logLines(kernel).filter((line) => line['msg'] === 'started ran').map((line) => line['entry']);
    expect(order).toEqual(['a', 'b', 'c', 'a', 'b']);
  });
});
