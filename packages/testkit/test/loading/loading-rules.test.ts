import { describe, expect, it } from 'vitest';
import { entry, useHarness, type TestExtension } from '../extension-folders.ts';

const harness = useHarness();

const noop = (name: string, namespace = name): TestExtension => ({ name: `@test/${name}`, namespace, entry: entry('') });

const command = (name: string, extra = '') =>
  `ctx.registerCommand('${name}', { description: 'Does it.', input: z.object({}), output: z.object({}), handle: () => ({}) ${extra} });`;

async function startFails(extensions: readonly TestExtension[], message: RegExp): Promise<void> {
  await expect(harness.start(extensions)).rejects.toMatchObject({ problem: { code: 'EXTENSION_INVALID', message: expect.stringMatching(message) } });
}

describe('loading rules (02 §2.9)', () => {
  it('M1.4-H1 a broken rule stops the kernel with EXTENSION_INVALID naming the extension', async () => {
    await startFails([{ ...noop('a'), entry: 'export default 42;' }], /@test\/a/);
  });

  it('M1.4-E1 a dependency that is not in the run', async () => {
    await startFails([{ ...noop('a'), dependencies: { '@test/b': '^0.1.0' } }], /@test\/a depends on @test\/b, which is not in this run/);
  });

  it('M1.4-E2 a dependency out of range', async () => {
    await startFails([{ ...noop('a'), dependencies: { '@test/b': '^2.0.0' } }, noop('b')], /@test\/a needs @test\/b \^2\.0\.0, but the run has 0\.1\.0/);
  });

  it('M1.4-E3 an sdk peer range the kernel does not satisfy, or no sdk peer', async () => {
    await startFails([{ ...noop('a'), sdkRange: '^9.0.0' }], /@test\/a needs @kvman\/sdk \^9\.0\.0, but this kvman has 0\.1\.0/);
    await startFails([{ ...noop('a'), sdkRange: '' }], /@test\/a: its manifest is invalid \(peerDependencies/);
  });

  it('M1.4-E4 a dependency cycle is printed', async () => {
    await startFails(
      [{ ...noop('a'), dependencies: { '@test/b': '^0.1.0' } }, { ...noop('b'), dependencies: { '@test/a': '^0.1.0' } }],
      /cycle: @test\/a → @test\/b → @test\/a/,
    );
  });

  it('M1.4-E5 two extensions with one namespace', async () => {
    await startFails([noop('a', 'shared'), noop('b', 'shared')], /@test\/a and @test\/b both claim the namespace "shared"/);
  });

  it('M1.4-E6 a name outside the namespace, and a name registered twice', async () => {
    await startFails([{ ...noop('a'), entry: entry(command('b.do-it')) }], /@test\/a: "b\.do-it" must be <namespace>/);
    await startFails([{ ...noop('a'), entry: entry(command('a.do-it') + command('a.do-it')) }], /@test\/a: "a\.do-it" is registered twice/);
  });

  it('M1.4-E7 a registration without a description, or whose input is not a zod schema', async () => {
    const noDescription = "ctx.registerQuery('a.get', { input: z.object({}), output: z.object({}), handle: () => ({}) } as never);";
    await startFails([{ ...noop('a'), entry: entry(noDescription) }], /@test\/a: the registration of "a\.get" is invalid/);
    const notZod = "ctx.registerQuery('a.get', { description: 'Gets it.', input: {}, output: z.object({}), handle: () => ({}) } as never);";
    await startFails([{ ...noop('a'), entry: entry(notZod) }], /@test\/a: the registration of "a\.get" is invalid/);
  });

  it('M1.4-E8 an entry that throws, or that is not a function', async () => {
    await startFails([{ ...noop('a'), entry: entry("throw new Error('boom');") }], /@test\/a: its entry failed \(boom\)/);
    await startFails([{ ...noop('a'), entry: 'export default {};' }], /@test\/a: its entry doesn't default-export a function/);
  });

  it('M1.4-E9 an unknown key in the kvman field', async () => {
    await startFails([{ ...noop('a'), kvmanExtra: { dependancies: {} } }], /@test\/a: its manifest is invalid/);
  });

  it('M1.4-E10 a maxInputBytes over 32 MiB', async () => {
    await startFails([{ ...noop('a'), entry: entry(command('a.do-it', ', maxInputBytes: 33 * 1024 * 1024')) }], /@test\/a: the registration of "a\.do-it" is invalid/);
  });

  it('M1.4-E11 a handler that registers fails EXTENSION_INVALID', async () => {
    const late = `ctx.registerCommand('a.late', { description: 'Registers late.', input: z.object({}), output: z.object({}), public: true,
      handle: () => { ${command('a.later')} return {}; } });`;
    const kernel = await harness.start([{ ...noop('a'), entry: entry(late) }]);
    await expect(kernel.exec('a.late', {})).rejects.toMatchObject({ problem: { code: 'EXTENSION_INVALID', message: expect.stringMatching(/registrations are sealed/) } });
  });

  it('M1.4-E12 each worker runs a dependency before its dependents', async () => {
    const logged = (name: string) =>
      `import { threadId } from 'node:worker_threads';\n${entry(`ctx.log.info('entry ran', { entry: '${name}', thread: threadId });`)}`;
    const kernel = await harness.start([{ ...noop('b'), entry: logged('b'), dependencies: { '@test/a': '^0.1.0' } }, { ...noop('a'), entry: logged('a') }], {
      settings: { 'kernel.workers': 2 },
    });
    const entries = harness.logLines(kernel).filter((line) => line['msg'] === 'entry ran');
    const threads = [...new Set(entries.map((line) => line['thread']))];
    expect(threads).toHaveLength(2);
    for (const thread of threads) {
      expect(entries.filter((line) => line['thread'] === thread).map((line) => line['entry'])).toEqual(['a', 'b']);
    }
  });
});
