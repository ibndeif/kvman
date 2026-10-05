import { describe, expect, it } from 'vitest';
import type { Json } from '@kvman/sdk';
import { useKvcoder } from './support/kvcoder-kernel.ts';

const kvcoder = useKvcoder();

describe('registering a connector for the run tool (08 §8.4, ADR 0011, 4 and 5)', { timeout: 30_000 }, () => {
  it('QA18-E7 help is every connector\'s own command, the built-in names are taken, and a binary keeps its help line', async () => {
    const { kernel } = await kvcoder.start();
    const register = (input: Json) => kernel.exec('kvcoder.connector.register', input as never, { as: '@test/todo' });
    await expect(register({ name: 'notes', description: 'Notes.', commands: [{ name: 'help', command: 'todo.item.list' }] })).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
    for (const name of ['shell', 'fs', 'artifact', 'background', 'ask', 'subagent']) {
      await expect(register({ name, description: 'Mine.', binary: { check: 'true' } }), name).rejects.toMatchObject({ problem: { code: 'kvcoder/NAME_TAKEN' } });
    }
    await register({ name: 'jobs', description: 'A name that is free again.', binary: { check: 'true' } });
    await register({ name: 'go', description: 'Go.', binary: { check: 'go version', help: 'go help {command}' } });
    const listed = await kernel.exec('kvcoder.connector.list', {});
    expect(listed.find((connector) => connector.name === 'go')).toMatchObject({ kind: 'binary', binary: { check: 'go version', help: 'go help {command}' } });
    expect(listed.find((connector) => connector.name === 'jobs')?.binary).toEqual({ check: 'true' });
  });
});
