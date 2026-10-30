import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { shippedWorkers, workersSchema } from '../src/delegate/workers.ts';
import { connectorDocSchema } from '../src/schemas/registry.ts';
import { readOnlyAllows } from '../src/turns/read-only.ts';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, fsCall, requestMessages, runs, says, shell, systemPrompt, textOf, toolResults, withoutHelperId } from './support/model-script.ts';
import { delegated } from './support/helpers.ts';
import { newSession } from './support/turns.ts';
import { worker, workers } from './support/workers.ts';

const kvcoder = useKvcoder();
const delegate = (name: string) => command('delegate', 'run', { worker: name, title: 'Helper', kind: 'find', goal: 'Look', done: 'It is done.' });
const lead = [runs(delegate('strict')), says('Started.'), says('parent done')];
const refusal = /^error VALIDATION_FAILED: This helper is read-only: .* could change something, so it isn't run\. Report what you found instead\./;

describe('a read-only worker (KVC-33, ADR 0056)', { timeout: 30_000 }, () => {
  // Superseded by QA68-H3: the council is read-only too (ADR 0103, 2).
  it('M2.4-E170 the shipped architect, reviewer, and council are read-only, and an entry without the field is not', () => {
    expect(shippedWorkers.filter((entry) => entry.readOnly).map((entry) => entry.name)).toEqual(['architect', 'reviewer', 'council']);
    const [old, strict] = workersSchema.parse([worker('old'), worker('strict', { readOnly: true })]);
    expect(old).toMatchObject({ readOnly: false });
    expect(strict).toMatchObject({ readOnly: true });
  });

  it.each(['auto', 'ask'] as const)('M2.4-E171 a read-only helper is refused every call that could change something, and asked nothing (approval %s)', async (approval) => {
    const world = await kvcoder.start({ settings: { ...workers(worker('strict', { readOnly: true })), 'kvcoder.approval': approval } });
    const { kernel, fake, helperFake } = world;
    writeFileSync(path.join(kernel.homeFolder, 'a.txt'), 'old\n');
    const sessionId = await newSession(kernel);
    await delegated(world, sessionId, lead, [
      runs(fsCall('read', { path: 'a.txt' }), fsCall('search', { pattern: 'old' }), command('fs', 'help')),
      runs(fsCall('write', { path: 'new.txt', content: 'x' }), fsCall('edit', { path: 'a.txt', edits: [{ oldText: 'old', newText: 'new' }] }), shell('touch ran.txt'), command('todo', 'add', { text: 'a' }), command('fs', 'part', { path: 'p.txt', part: 1, content: 'x' })),
      runs(command('artifact', 'write', { id: 'report', title: 'Report', content: '# Found' })),
      says('report ready'),
    ]);
    const child = toolResults(helperFake, 3);
    expect(child.slice(0, 3).every((result) => !result.startsWith('error'))).toBe(true);
    for (const result of child.slice(3, 8)) expect(result).toMatch(refusal);
    expect(child[8]).toMatch(/^error VALIDATION_FAILED: A helper writes no artifact/);
    expect(['new.txt', 'ran.txt'].map((file) => existsSync(path.join(kernel.homeFolder, file)))).toEqual([false, false]);
    expect(await kernel.exec('todo.item.list', {})).toEqual([]);
    expect(withoutHelperId(textOf(requestMessages(fake).at(-1)))).toMatch(/finished:\nreport ready$/);
  });

  it("M2.4-E172 and QA58-E8 a read-only helper's prompt lists only what it may run, and keeps that when the worker is edited", async () => {
    const world = await kvcoder.start({ settings: workers(worker('strict', { readOnly: true }), worker('free')) });
    await delegated(world, await newSession(world.kernel), [runs(delegate('strict'), command('delegate', 'run', { worker: 'free', title: 'Helper', kind: 'change', files: ['a.txt'], goal: 'Look', done: 'It is done.' })), says('Started.'), says('done'), says('done')], [says('one'), says('two')]);
    const prompts = [systemPrompt(world.helperFake, 0), systemPrompt(world.helperFake, 1)];
    const strict = prompts.find((prompt) => prompt.includes('You are read-only here'));
    const free = prompts.find((prompt) => !prompt.includes('You are read-only here'));
    expect(strict).toContain('- fs: ');
    // QA58-E8: a read-only helper has fs find too.
    expect(strict).toMatch(/\n {2}read +\{ path, fromLine\?, fromColumn\?, lines\? \}\n {2}read-files +\{ files: \[\{ path, fromLine\?, lines\? \}\] \}\n {2}list +\{ path\? \}\n {2}find +\{ pattern, path\? \}\n {2}search +\{ pattern, path\?, literal\?, glob\?, context\?, filesOnly\? \}\n {2}help +\{ command\? \}/);
    expect(strict).not.toContain('- shell: ');
    expect(strict).toContain('- todo: Keep a todo list.\n  list {}\n  help { command? }');
    expect(free).toContain('- shell: ');
    expect(free).toContain('  write ');
  });

  it("QA52-H4 a read-only helper runs another extension's query, and is refused its commands before any approval", async () => {
    const world = await kvcoder.start({ settings: { ...workers(worker('strict', { readOnly: true })), 'kvcoder.approval': 'ask' } });
    const { kernel, helperFake } = world;
    await kernel.exec('todo.item.add', { text: 'milk' });
    await delegated(world, await newSession(kernel), lead, [runs(command('todo', 'list'), command('todo', 'add', { text: 'bread' })), says('found milk')]);
    const [listed, added] = toolResults(helperFake, 1);
    expect(JSON.parse(listed ?? '')).toEqual([{ text: 'milk' }]);
    expect(added).toMatch(refusal);
    expect(await kernel.exec('todo.item.list', {})).toEqual([{ text: 'milk' }]);
    expect(systemPrompt(helperFake, 0)).toContain('- todo: Keep a todo list.\n  list {}\n  help { command? }');
  });

  it("QA52-E4 a read-only helper's binary and MCP calls stay refused, and a binary connector isn't listed", async () => {
    const binary = { name: 'gh', description: 'GitHub CLI.', binary: { check: 'true' } };
    const world = await kvcoder.start({ settings: { ...workers(worker('strict', { readOnly: true })), 'kvcoder.connectors': [binary] } });
    await delegated(world, await newSession(world.kernel), lead, [runs(command('gh', 'exec', { args: 'version', risky: false }), command('mcp', 'call', { server: 'none', tool: 'x', arguments: {}, risky: false })), says('nothing')]);
    for (const result of toolResults(world.helperFake, 1)) expect(result).toMatch(/^error VALIDATION_FAILED: (This helper is read-only|\w+ isn't available in this subagent)/);
    expect(systemPrompt(world.helperFake, 0)).not.toContain('- gh: ');
  });

  it('QA52-E5 a connector command stored before ADR 0082 reads as no query, so a read-only helper may not run it', () => {
    const old = connectorDocSchema.parse({ owner: '@test/todo', name: 'todo', description: 'Todos.', kind: 'commands', commands: [{ name: 'list', command: 'todo.item.list', examples: [] }], binary: null });
    expect(old.commands?.[0]).toMatchObject({ query: false, card: null, asks: false });
    expect(readOnlyAllows('list', undefined, old.commands?.[0])).toBe(false);
    expect(readOnlyAllows('list', undefined, { query: true, asks: true })).toBe(false);
    expect(readOnlyAllows('list', undefined, { query: true, asks: false })).toBe(true);
  });
});
