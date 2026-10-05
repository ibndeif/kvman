import { describe, expect, it } from 'vitest';
import type { Json } from '@kvman/sdk';
import { useKvcoder } from './support/kvcoder-kernel.ts';

const kvcoder = useKvcoder();

describe('connector registration (08 §8.4, ADR 0009, 100 and 106)', { timeout: 30_000 }, () => {
  it('M2.4-E39 commands must be the caller\'s own public ones, a connector has one kind, names are kebab case, and names are owned', async () => {
    const { kernel } = await kvcoder.start();
    const register = (input: Json, as = '@test/todo') => kernel.exec('kvcoder.connector.register', input as never, { as });
    for (const input of [
      { name: 'x', description: 'X.', commands: [{ name: 'go', command: 'kvai.complete' }] },
      { name: 'x', description: 'X.', commands: [{ name: 'go', command: 'todo.private' }] },
      { name: 'x', description: 'X.', commands: [{ name: 'go', command: 'todo.item.add' }], binary: { check: 'true' } },
      { name: 'x', description: 'X.' },
      { name: 'Bad_Name', description: 'X.', binary: { check: 'true' } },
      { name: 'x', description: 'X.', commands: [{ name: 'Go', command: 'todo.item.add' }] },
    ]) {
      await expect(register(input), JSON.stringify(input)).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
    }
    for (const name of ['todo', 'ask', 'delegate', 'shell', 'fs', 'artifact', 'background']) {
      await expect(register({ name, description: 'Mine.', binary: { check: 'true' } }, '@kvman/kvai'), name).rejects.toMatchObject({ problem: { code: 'kvcoder/NAME_TAKEN' } });
    }
    await register({ name: 'todo', description: 'A newer todo list.', commands: [{ name: 'add', command: 'todo.item.add' }] });
    expect((await kernel.exec('kvcoder.connector.list', {})).find((connector) => connector.name === 'todo')).toMatchObject({ description: 'A newer todo list.', owner: '@test/todo', kind: 'commands' });
    await expect(kernel.exec('kvcoder.connector.unregister', { name: 'todo' }, { as: '@kvman/kvai' })).rejects.toMatchObject({ problem: { code: 'kvcoder/NAME_TAKEN' } });
    await kernel.exec('kvcoder.connector.unregister', { name: 'never-registered' }, { as: '@test/todo' });
    await kernel.exec('kvcoder.connector.unregister', { name: 'todo' }, { as: '@test/todo' });
    expect((await kernel.exec('kvcoder.connector.list', {})).map((connector) => connector.name)).toEqual([]);
  });

  it("M2.4-E40 connectors are cleared at kvcoder's start and registered again, and an unloaded owner's entries are ignored", async () => {
    const { kernel } = await kvcoder.start();
    await kernel.exec('kvcoder.connector.register', { name: 'extra', description: 'Extra.', binary: { check: 'true' } }, { as: '@test/todo' });
    await kernel.exec('kvcoder.connector.register', { name: 'gone', description: 'Gone.', binary: { check: 'true' } }, { as: '@gone/extension' });
    await kernel.exec('kvcoder.handler.register', { point: 'kvcoder.session.created', command: 'todo.seen' }, { as: '@test/todo' });
    expect((await kernel.exec('kvcoder.connector.list', {})).map((connector) => connector.name).sort()).toEqual(['extra', 'todo']);
    await kernel.restart();
    await kernel.clock.advance(0);
    expect((await kernel.exec('kvcoder.connector.list', {})).map((connector) => connector.name)).toEqual(['todo']);
    expect(await kernel.exec('kvcoder.handler.list', {})).toEqual([]);
  });
});
