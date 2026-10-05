import { describe, expect, it } from 'vitest';
import type { Json } from '@kvman/sdk';
import { useKvcoder } from './support/kvcoder-kernel.ts';

const kvcoder = useKvcoder();

describe('registering a connector for the run tool (08 §8.4, ADR 0011, 4 and 5)', { timeout: 30_000 }, () => {
  it('QA18-E7 help is every connector\'s own command, the built-in names are taken, and a binary keeps its help line', async () => {
    const { kernel } = await kvcoder.start();
    const register = (input: Json) => kernel.exec('kvcoder.connector.register', input as never, { as: '@test/todo' });
    await expect(register({ name: 'notes', description: 'Notes.', commands: [{ name: 'help', command: 'todo.item.list' }] })).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
    for (const name of ['shell', 'fs', 'artifact', 'background', 'ask', 'delegate']) {
      await expect(register({ name, description: 'Mine.', binary: { check: 'true' } }), name).rejects.toMatchObject({ problem: { code: 'kvcoder/NAME_TAKEN' } });
    }
    await register({ name: 'jobs', description: 'A name that is free again.', binary: { check: 'true' } });
    await register({ name: 'go', description: 'Go.', binary: { check: 'go version', help: 'go help {command}' } });
    const listed = await kernel.exec('kvcoder.connector.list', {});
    expect(listed.find((connector) => connector.name === 'go')).toMatchObject({ kind: 'binary', binary: { check: 'go version', help: 'go help {command}' } });
    expect(listed.find((connector) => connector.name === 'jobs')?.binary).toEqual({ check: 'true' });
  });

  it('QA31-E11 delegate is a name kvcoder owns, and subagent is free again', async () => {
    const { kernel } = await kvcoder.start();
    const register = (name: string) => kernel.exec('kvcoder.connector.register', { name, description: 'Mine.', binary: { check: 'true' } }, { as: '@test/todo' });
    await expect(register('delegate')).rejects.toMatchObject({ problem: { code: 'kvcoder/NAME_TAKEN' } });
    await register('subagent');
    expect((await kernel.exec('kvcoder.connector.list', {})).map((connector) => connector.name)).toContain('subagent');
  });

  it('QA18-H26 several connectors are registered in one call, and the single form still works', async () => {
    const { kernel } = await kvcoder.start();
    const register = (input: Json) => kernel.exec('kvcoder.connector.register', input as never, { as: '@test/todo' });
    await register({ connectors: [{ name: 'notes', description: 'Notes.', commands: [{ name: 'list', command: 'todo.item.list' }] }, { name: 'gh', description: 'GitHub CLI.', binary: { check: 'gh --version' } }, { name: 'todo', description: 'A newer todo list.', commands: [{ name: 'add', command: 'todo.item.add' }] }] });
    await register({ name: 'single', description: 'One.', binary: { check: 'true' } });
    const listed = await kernel.exec('kvcoder.connector.list', {});
    expect(listed.map((connector) => `${connector.name}:${connector.kind}`).sort()).toEqual(['gh:binary', 'notes:commands', 'single:binary', 'todo:commands']);
    expect(listed.find((connector) => connector.name === 'todo')?.description).toBe('A newer todo list.');
  });

  it('QA18-E27 a call that registers several connectors stores all of them or none', async () => {
    const { kernel } = await kvcoder.start();
    const register = (connectors: Json, as = '@test/todo') => kernel.exec('kvcoder.connector.register', { connectors } as never, { as });
    const good = { name: 'notes', description: 'Notes.', commands: [{ name: 'list', command: 'todo.item.list' }] };
    await kernel.exec('kvcoder.connector.register', { name: 'theirs', description: 'Theirs.', binary: { check: 'true' } }, { as: '@kvman/kvai' });
    await expect(register([good, { name: 'theirs', description: 'Mine now.', binary: { check: 'true' } }])).rejects.toMatchObject({ problem: { code: 'kvcoder/NAME_TAKEN', params: { name: 'theirs', owner: '@kvman/kvai' } } });
    await expect(register([good, { name: 'fs', description: 'Mine.', binary: { check: 'true' } }])).rejects.toMatchObject({ problem: { code: 'kvcoder/NAME_TAKEN' } });
    await expect(register([good, { name: 'other', description: 'Other.', commands: [{ name: 'go', command: 'kvai.complete' }] }])).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
    await expect(register([good, { ...good, description: 'Again.' }])).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED', params: { name: 'notes' } } });
    await expect(register([])).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
    expect((await kernel.exec('kvcoder.connector.list', {})).map((connector) => connector.name).sort()).toEqual(['theirs', 'todo']);
  });

  it('QA18-E28 an extension with no command or query of its own still counts as loaded: its binary connector and its section are used', async () => {
    const quiet = { name: '@test/quiet', namespace: 'quiet', dependencies: { '@kvman/kvcoder': '^0.1.0' }, entry: `import type { Ctx } from '@kvman/sdk';

export default (ctx: Ctx): void => {
  ctx.registerHandler('kernel.started', {
    description: 'Registers a program and a section with kvcoder.',
    handle: async () => {
      await ctx.exec('kvcoder.connector.register', { name: 'quiet-node', description: 'Node.js.', binary: { check: 'node --version' } });
      await ctx.exec('kvcoder.section.set', { id: 'note', title: 'Quiet note', order: 1, global: true, content: 'Said quietly.' });
    },
  });
};
` };
    const { kernel } = await kvcoder.start({ extensions: [quiet] });
    expect((await kernel.exec('kernel.registrations.list', {})).some((row) => row.extension === '@test/quiet')).toBe(false);
    expect((await kernel.exec('kvcoder.connector.list', {})).map((connector) => connector.name)).toEqual(['quiet-node']);
    const session = await kernel.exec('kvcoder.session.create', { title: 'Quiet' });
    expect((await kernel.exec('kvcoder.prompt.get', { sessionId: session.id })).prompt).toContain('## Quiet note\nSaid quietly.');
  });
});
