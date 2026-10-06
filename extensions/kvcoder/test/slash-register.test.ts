import { describe, expect, it } from 'vitest';
import type { Json } from '@kvman/sdk';
import type { TestKernel } from '@kvman/testkit';
import { todo, useKvcoder } from './support/kvcoder-kernel.ts';
import { slashFixture } from './support/registry-fixtures.ts';

const kvcoder = useKvcoder();

const owner = '@test/todo';
const start = { name: 'todo', description: 'todo.slash.todo', command: 'todo.list.start' };
const add = { name: 'todo-add', description: 'todo.slash.add', command: 'todo.list.start', message: 'todo.slash.add.message' };

const register = (kernel: TestKernel, commands: Json, as: string | null = owner) => kernel.exec('kvcoder.slash.register', { commands } as never, as === null ? {} : { as });
const listed = (kernel: TestKernel) => kernel.exec('kvcoder.slash.list', {});
const failed = (code: string, params?: Record<string, Json>) => ({ problem: { code, ...(params === undefined ? {} : { params }) } });

describe('slash commands that extensions add to the send box (08 §8.4, ADR 0027, 8)', { timeout: 30_000 }, () => {
  it('QA39-H11 an extension registers slash commands, listed by name with their owner', async () => {
    const { kernel } = await kvcoder.start();
    expect(await register(kernel, [add, start])).toEqual({});
    expect(await listed(kernel)).toEqual([{ ...start, owner }, { ...add, owner }]);
  });

  it('QA39-H12 the owner unregisters one of its commands', async () => {
    const { kernel } = await kvcoder.start();
    await register(kernel, [start, add]);
    expect(await kernel.exec('kvcoder.slash.unregister', { name: 'todo' }, { as: owner })).toEqual({});
    expect(await listed(kernel)).toEqual([{ ...add, owner }]);
  });

  it("QA39-E1 kvcoder's own six names are taken", async () => {
    const { kernel } = await kvcoder.start();
    for (const name of ['compact', 'export', 'fork', 'new', 'prompt', 'rename']) {
      await expect(register(kernel, [{ ...start, name }]), name).rejects.toMatchObject(failed('kvcoder/NAME_TAKEN', { name, owner: '@kvman/kvcoder' }));
    }
    expect(await listed(kernel)).toEqual([]);
  });

  it("QA39-E2 another extension's name is taken, for registering and for unregistering", async () => {
    const { kernel } = await kvcoder.start();
    await register(kernel, [start]);
    const theirs = failed('kvcoder/NAME_TAKEN', { name: 'todo', owner });
    await expect(register(kernel, [{ name: 'todo', description: 'kvai.slash.todo', command: 'kvai.provider.add' }], '@kvman/kvai')).rejects.toMatchObject(theirs);
    await expect(kernel.exec('kvcoder.slash.unregister', { name: 'todo' }, { as: '@kvman/kvai' })).rejects.toMatchObject(theirs);
    expect(await listed(kernel)).toEqual([{ ...start, owner }]);
  });

  it('QA39-E3 a call registers all of its commands or none', async () => {
    const { kernel } = await kvcoder.start();
    await expect(register(kernel, [add, start, { ...start, description: 'todo.slash.again' }])).rejects.toMatchObject(failed('VALIDATION_FAILED', { name: 'todo' }));
    expect(await listed(kernel)).toEqual([]);
    await expect(register(kernel, [add, { ...start, description: '' }])).rejects.toMatchObject(failed('VALIDATION_FAILED'));
    await expect(register(kernel, [])).rejects.toMatchObject(failed('VALIDATION_FAILED'));
    expect(await listed(kernel)).toEqual([]);
  });

  it("QA39-E4 the command must be a public command of the caller", async () => {
    const { kernel } = await kvcoder.start();
    for (const command of ['todo.private', 'kvai.provider.add', 'todo.item.list', 'todo.nothing']) {
      await expect(register(kernel, [{ ...start, command }]), command).rejects.toMatchObject(failed('VALIDATION_FAILED', { command }));
    }
    expect(await listed(kernel)).toEqual([]);
  });

  it('QA39-E5 a name is lowercase kebab case', async () => {
    const { kernel } = await kvcoder.start();
    for (const name of ['Todo', 'todo_add', '/todo']) await expect(register(kernel, [{ ...start, name }]), name).rejects.toMatchObject(failed('VALIDATION_FAILED'));
    expect(await listed(kernel)).toEqual([]);
  });

  it('QA39-E6 only an extension registers a slash command', async () => {
    const { kernel } = await kvcoder.start();
    await expect(register(kernel, [start], null)).rejects.toMatchObject(failed('VALIDATION_FAILED'));
    expect(await listed(kernel)).toEqual([]);
  });

  it('QA39-E7 unregistering a name nothing has does nothing', async () => {
    const { kernel } = await kvcoder.start();
    await register(kernel, [start]);
    expect(await kernel.exec('kvcoder.slash.unregister', { name: 'nope' }, { as: owner })).toEqual({});
    expect(await listed(kernel)).toEqual([{ ...start, owner }]);
  });

  it('QA39-E8 slash commands last one run: a restart keeps only what the extensions register at that start', async () => {
    const { kernel } = await kvcoder.start({ extensions: [todo, slashFixture] });
    await kernel.clock.advance(0);
    const fromFixture = { name: 'from-fixture', description: 'slash.fixture', command: 'slash.run', owner: '@test/slash' };
    expect(await listed(kernel)).toEqual([fromFixture]);
    await register(kernel, [start]);
    expect(await listed(kernel)).toEqual([fromFixture, { ...start, owner }]);
    await kernel.restart();
    await kernel.clock.advance(0);
    expect(await listed(kernel)).toEqual([fromFixture]);
  });

  it("QA39-E9 registering a name again replaces the caller's own", async () => {
    const { kernel } = await kvcoder.start();
    await register(kernel, [start, add]);
    await register(kernel, [{ ...start, description: 'todo.slash.newer', message: 'todo.slash.newer.message' }]);
    expect(await listed(kernel)).toEqual([{ ...start, description: 'todo.slash.newer', message: 'todo.slash.newer.message', owner }, { ...add, owner }]);
  });
});
