import { describe, expect, it } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, runs, says, systemPrompt, toolResults, type RunCallSpec } from './support/model-script.ts';
import { newSession } from './support/turns.ts';
import { delegated, helperIds } from './support/helpers.ts';

const kvcoder = useKvcoder();
const step = (id: string, after: string[] = []) => ({ id, title: `Do ${id}`, ...(after.length === 0 ? {} : { after }), check: `check ${id}` });
const set = (...steps: ReturnType<typeof step>[]): RunCallSpec => command('execution-map', 'set', { goal: 'Ship it', steps });
const update = (...steps: Record<string, string>[]): RunCallSpec => command('execution-map', 'update', { steps });
const detail = (id: string): RunCallSpec => command('execution-map', 'detail', { id, details: `How ${id} is done` });
const evidence = 'pnpm test passed, 12 of 12';
const done = (id: string) => ({ id, status: 'done', evidence });
const parsed = (text: string | undefined) => JSON.parse(text ?? 'null') as Record<string, unknown>;

async function chat(...replies: Parameters<Awaited<ReturnType<typeof kvcoder.start>>['fake']['reply']>) {
  const world = await kvcoder.start();
  const sessionId = await newSession(world.kernel);
  world.fake.reply(...replies);
  await world.kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  await world.kernel.clock.advance(0);
  return { ...world, sessionId };
}

describe('the execution map (08 §8.5, ADR 0064)', { timeout: 30_000 }, () => {
  it('M2.4-E220 set makes the map and returns where the work is', async () => {
    const { kernel, fake, sessionId } = await chat(runs(set(step('read'), step('build', ['read']))), says('planned'));
    expect(parsed(toolResults(fake)[0])).toEqual({ goal: 'Ship it', progress: '0 of 2 done', doing: [], ready: ['read: Do read'], waiting: ['build: Do build'], failed: [], undetailed: ['read: Do read', 'build: Do build'], notes: 0 });
    const map = await kernel.exec('kvcoder.map.get', { sessionId });
    expect(map?.steps.map((found) => [found.id, found.status, found.after])).toEqual([['read', 'todo', []], ['build', 'todo', ['read']]]);
    expect(map).toMatchObject({ goal: 'Ship it', version: 1, notes: [] });
    expect(systemPrompt(fake, 0)).toMatch(/- execution-map: [^\n]*\n {2}set +\{ goal \(≤300\), steps: \[\{ id \(≤50\), title \(≤100\), after\?, uses\?, check \(≤300\), details\? \(≤4000\) \}\] \}\n {2}detail +\{ id \(≤50\), details \(≤4000\) \}\n {2}update +\{ steps: \[\{ id \(≤50\), status: "todo" \| "doing" \| "done" \| "failed" \| "skipped", evidence\? \(≤500\), note\? \(≤300\) \}\] \}\n {2}note +\{ text \(≤500\) \}\n {2}get +\{ id\? \(≤50\) \}/);
  });

  it('M2.4-E220 a step names what it uses as one name or a list, kept as one text', async () => {
    const steps = [{ ...step('read'), uses: 'fs' }, { ...step('build', ['read']), uses: ['fs', 'shell'] }];
    const { kernel, sessionId } = await chat(runs(command('execution-map', 'set', { goal: 'Ship it', steps })), says('planned'));
    expect((await kernel.exec('kvcoder.map.get', { sessionId }))?.steps.map((found) => found.uses)).toEqual(['fs', 'fs, shell']);
  });

  it('M2.4-E221 steps with no path between them are ready together, and the step after them when both are done', async () => {
    const { fake } = await chat(runs(set(step('store'), step('page'), step('test', ['store', 'page']))), runs(update(done('store'), done('page'))), says('ok'));
    expect(parsed(toolResults(fake, 1)[0])['ready']).toEqual(['store: Do store', 'page: Do page']);
    expect(parsed(toolResults(fake, 2).at(-1))).toMatchObject({ progress: '2 of 3 done', ready: ['test: Do test'], waiting: [] });
  });

  it('M2.4-E222 a second set keeps a step that stays, starts a new one, drops a removed one, and keeps the notes', async () => {
    const { kernel, sessionId } = await chat(
      runs(set(step('read'), step('old', ['read']))),
      runs(update(done('read')), command('execution-map', 'note', { text: 'The date parser takes two-digit years.' })),
      runs(set(step('read'), step('fresh', ['read']))),
      says('ok'),
    );
    const map = await kernel.exec('kvcoder.map.get', { sessionId });
    expect(map?.steps.map((found) => [found.id, found.status, found.evidence])).toEqual([['read', 'done', evidence], ['fresh', 'todo', null]]);
    expect(map?.notes.map((note) => note.text)).toEqual(['The date parser takes two-digit years.']);
    expect(map?.version).toBe(4);
  });

  it('M2.4-E223 note counts in the result, and a chat with no map refuses update, note, and get', async () => {
    const { fake } = await chat(
      runs(update({ id: 'a', status: 'doing' }), command('execution-map', 'note', { text: 'x' }), command('execution-map', 'get')),
      runs(set(step('a'))),
      runs(command('execution-map', 'note', { text: 'Later.' })),
      runs(command('execution-map', 'get')),
      says('ok'),
    );
    expect(toolResults(fake, 1)).toEqual(Array.from({ length: 3 }, () => 'error NOT_FOUND: This chat has no execution map yet. Make one with execution-map set.'));
    expect(parsed(toolResults(fake, 3).at(-1))['notes']).toBe(1);
    expect(parsed(toolResults(fake, 4).at(-1))).toMatchObject({ noted: ['Later.'], steps: [{ id: 'a', status: 'todo' }] });
  });

  it('M2.4-E224 the map calls of one reply apply in the order the model gave them', async () => {
    const { fake } = await chat(runs(set(step('a'), step('b', ['a'])), detail('a'), detail('b')), runs(update({ id: 'a', status: 'doing' }), update(done('a')), update({ id: 'b', status: 'doing' })), runs(update({ id: 'b', status: 'done' })), says('ok'));
    expect(toolResults(fake, 2).slice(3).map((text) => parsed(text)['progress'])).toEqual(['0 of 2 done', '1 of 2 done', '1 of 2 done']);
    expect(parsed(toolResults(fake, 2).at(-1))['doing']).toEqual(['b: Do b']);
    expect(toolResults(fake, 3).slice(-1)).toEqual(['error VALIDATION_FAILED: b needs evidence to be done: say what you ran or checked and what it showed.']);
  });

  it("M2.4-E225 a helper has no execution-map, and its session reads the chat's map", async () => {
    const world = await kvcoder.start();
    const sessionId = await newSession(world.kernel);
    await delegated(world, sessionId, [runs(set(step('a'))), runs(command('delegate', 'run', { worker: 'general', title: 'Helper', kind: 'find', goal: 'Look', done: 'It is done.' })), says('Started.'), says('Read it.')], [runs(update({ id: 'a', status: 'doing' })), says('looked')]);
    expect(systemPrompt(world.helperFake, 0)).not.toContain('- execution-map: ');
    expect(toolResults(world.helperFake, 1)).toEqual(["error VALIDATION_FAILED: execution-map isn't available in this subagent."]);
    const [helperId = ''] = await helperIds(world.kernel, sessionId);
    const map = await world.kernel.exec('kvcoder.map.get', { sessionId });
    expect(map?.steps[0]?.status).toBe('todo');
    expect(await world.kernel.exec('kvcoder.map.get', { sessionId: helperId })).toEqual(map);
  });

  it('M2.4-E226 a chat with no map answers null, and deleting a chat deletes its map', async () => {
    const { kernel, sessionId } = await chat(runs(set(step('a'))), says('ok'));
    const other = await newSession(kernel);
    expect(await kernel.exec('kvcoder.map.get', { sessionId: other })).toBeNull();
    await kernel.exec('kvcoder.session.delete', { sessionId });
    await expect(kernel.exec('kvcoder.map.get', { sessionId })).rejects.toMatchObject({ problem: { code: 'kvcoder/SESSION_NOT_FOUND' } });
  });
});
