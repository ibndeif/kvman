import { describe, expect, it } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, runs, says, systemPrompt, toolResults, type RunCallSpec } from './support/model-script.ts';
import { newSession } from './support/turns.ts';

const kvcoder = useKvcoder();
const step = (id: string, after: string[] = []) => ({ id, title: `Do ${id}`, ...(after.length === 0 ? {} : { after }), check: `check ${id}` });
const set = (...steps: Record<string, unknown>[]): RunCallSpec => command('execution-map', 'set', { goal: 'Ship it', steps });
const detail = (id: string, details = `How ${id} is done`): RunCallSpec => command('execution-map', 'detail', { id, details });
const update = (...steps: Record<string, string>[]): RunCallSpec => command('execution-map', 'update', { steps });
const get = (payload: Record<string, unknown> = {}): RunCallSpec => command('execution-map', 'get', payload);
const parsed = (text: string | undefined) => JSON.parse(text ?? 'null') as Record<string, unknown>;
const noMap = 'error NOT_FOUND: This chat has no execution map yet. Make one with execution-map set.';
const markdown = '## Read the settings\n\n- `src/settings.ts`\n\n| File | Change |\n| --- | --- |\n| a.ts | rename |\n\n```mermaid\ngraph TD; read-->page\n```';

async function chat(...replies: Parameters<Awaited<ReturnType<typeof kvcoder.start>>['fake']['reply']>) {
  const world = await kvcoder.start();
  const sessionId = await newSession(world.kernel);
  world.fake.reply(...replies);
  await world.kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  await world.kernel.clock.advance(0);
  const map = async () => world.kernel.exec('kvcoder.map.get', { sessionId });
  return { ...world, sessionId, map };
}

describe('the map set as a skeleton, each step detailed on its own (08 §8.5, ADR 0086)', { timeout: 30_000 }, () => {
  it('QA54-H1 set takes the skeleton, and the index shows set, detail, and get', async () => {
    const { fake, map } = await chat(runs(set(step('read'), step('build', ['read']))), says('ok'));
    expect(parsed(toolResults(fake, 1).at(-1))).toEqual({ goal: 'Ship it', progress: '0 of 2 done', doing: [], ready: ['read: Do read'], waiting: ['build: Do build'], failed: [], undetailed: ['read: Do read', 'build: Do build'], notes: 0 });
    expect((await map())?.steps.map((found) => found.details)).toEqual([null, null]);
    const prompt = systemPrompt(fake, 0);
    expect(prompt).toMatch(/\n {2}set +\{ goal \(≤300\), steps: \[\{ id \(≤50\), title \(≤100\), after\?, uses\?, check \(≤300\) \}\] \}\n {2}detail +\{ id \(≤50\), details \(≤4000\) \}\n/);
    expect(prompt).toMatch(/\n {2}get +\{ id\? \(≤50\) \}/);
  });

  it('QA54-H2 detail writes one step whole, and a second detail replaces it', async () => {
    const { fake, map } = await chat(runs(set(step('read'), step('build'))), runs(detail('read', markdown), get({ id: 'read' })), runs(detail('read', 'Second text.')), says('ok'));
    const [written, read] = toolResults(fake, 2).slice(-2);
    expect(parsed(written)['undetailed']).toEqual(['build: Do build']);
    expect(parsed(read)['step']).toMatchObject({ id: 'read', details: markdown });
    expect(await map()).toMatchObject({ version: 3, steps: [{ id: 'read', details: 'Second text.' }, { id: 'build', details: null }] });
  });

  it('QA54-H3 a second set keeps the details of a kept step, and a new step has none', async () => {
    const { fake, map } = await chat(runs(set(step('read'), step('old')), detail('read'), detail('old')), runs(set(step('read'), step('fresh'))), says('ok'));
    expect(parsed(toolResults(fake, 2).at(-1))['undetailed']).toEqual(['fresh: Do fresh']);
    expect((await map())?.steps.map((found) => [found.id, found.details])).toEqual([['read', 'How read is done'], ['fresh', null]]);
  });

  it('QA54-H4 a detailed step starts', async () => {
    const { fake, map } = await chat(runs(set(step('read')), detail('read'), update({ id: 'read', status: 'doing' })), says('ok'));
    expect(parsed(toolResults(fake, 1).at(-1))['doing']).toEqual(['read: Do read']);
    expect((await map())?.steps[0]?.status).toBe('doing');
  });

  it('QA54-H5 get leaves the details out, and get of one step gives it whole', async () => {
    const { fake } = await chat(runs(set(step('read'), step('build')), detail('read'), detail('build'), command('execution-map', 'note', { text: 'Later.' })), runs(get(), get({ id: 'read' })), says('ok'));
    const [light, one] = toolResults(fake, 2).slice(-2).map(parsed);
    const bare = { title: 'Do read', after: [], uses: null, check: 'check read', status: 'todo', evidence: null, note: null };
    expect(light).toMatchObject({ progress: '0 of 2 done', undetailed: [], noted: ['Later.'] });
    expect(light?.['steps']).toEqual([{ id: 'read', ...bare }, { id: 'build', ...bare, title: 'Do build', check: 'check build' }]);
    expect(one).toMatchObject({ progress: '0 of 2 done', noted: ['Later.'], step: { id: 'read', ...bare, details: 'How read is done' } });
    expect(one).not.toHaveProperty('steps');
  });

  it("QA54-H6 the person's view has every step's details", async () => {
    const { map } = await chat(runs(set(step('read'), step('build')), detail('read')), says('ok'));
    expect((await map())?.steps.map((found) => found.details)).toEqual(['How read is done', null]);
  });

  it('QA54-E1 detail with no map is refused', async () => {
    const { fake } = await chat(runs(detail('read')), says('ok'));
    expect(toolResults(fake, 1)).toEqual([noMap]);
  });

  it('QA54-E2 detail of a step the map lacks names the steps it has, and changes nothing', async () => {
    const { fake, map } = await chat(runs(set(step('read'), step('build'))), runs(detail('ghost')), says('ok'));
    expect(toolResults(fake, 2).at(-1)).toBe('error VALIDATION_FAILED: The map has no step ghost. Its steps are: read, build.');
    expect((await map())?.version).toBe(1);
  });

  it('QA54-E3 details are 1 to 4,000 characters', async () => {
    const { fake, map } = await chat(runs(set(step('read'))), runs(detail('read', 'x'.repeat(4001)), detail('read', ''), detail('read', 'y'.repeat(4000))), says('ok'));
    const [over, empty, most] = toolResults(fake, 2).slice(-3);
    expect([over?.slice(0, 23), empty?.slice(0, 23)]).toEqual(['error VALIDATION_FAILED', 'error VALIDATION_FAILED']);
    expect(parsed(most)['undetailed']).toEqual([]);
    expect((await map())?.steps[0]?.details).toBe('y'.repeat(4000));
  });

  it('QA54-E4 set refuses a step with details or a description', async () => {
    const { fake, map } = await chat(runs(set({ ...step('read'), details: 'How.' }), set({ ...step('read'), description: 'How.' })), says('ok'));
    expect(toolResults(fake, 1).map((text) => text.slice(0, 23))).toEqual(['error VALIDATION_FAILED', 'error VALIDATION_FAILED']);
    expect(await map()).toBeNull();
  });

  it('QA54-E5 doing needs details, and the refused batch changes nothing', async () => {
    const { fake, map } = await chat(runs(set(step('read'), step('page')), detail('read')), runs(update({ id: 'read', status: 'doing' }, { id: 'page', status: 'doing' })), says('ok'));
    expect(toolResults(fake, 2).at(-1)).toBe("error VALIDATION_FAILED: page can't be doing yet: it has no details. Write them with execution-map detail first.");
    expect((await map())?.steps.map((found) => found.status)).toEqual(['todo', 'todo']);
  });

  it("QA54-E6 skipped and failed don't need details", async () => {
    const { map } = await chat(runs(set(step('a'), step('b'))), runs(update({ id: 'a', status: 'skipped', note: 'Not needed.' }, { id: 'b', status: 'failed', note: 'The build broke.' })), says('ok'));
    expect((await map())?.steps.map((found) => found.status)).toEqual(['skipped', 'failed']);
  });

  it('QA54-E7 get of a step the map lacks names the steps it has, and with no map it is not found', async () => {
    const empty = await chat(runs(get({ id: 'read' })), says('ok'));
    expect(toolResults(empty.fake, 1)).toEqual([noMap]);
    const { fake } = await chat(runs(set(step('read'))), runs(get({ id: 'ghost' })), says('ok'));
    expect(toolResults(fake, 2).at(-1)).toBe('error VALIDATION_FAILED: The map has no step ghost. Its steps are: read.');
  });

  it('QA54-E9 set and the details of its steps in one reply apply in order', async () => {
    const { fake, map } = await chat(runs(set(step('a'), step('b', ['a'])), detail('a'), detail('b')), says('ok'));
    const results = toolResults(fake, 1);
    expect(results.map((text) => parsed(text)['undetailed'])).toEqual([['a: Do a', 'b: Do b'], ['b: Do b'], []]);
    expect((await map())?.version).toBe(3);
  });
});
