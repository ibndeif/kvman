import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ConversationView from '../../web/src/ConversationView.vue';
import { createFakeKvman } from './support/fake-kvman.ts';
import { artifactContent, artifactSummary, choose, executionMap, mapStep, mounted, serve, session, turn, user, type World } from './support/fixtures.ts';

afterEach(() => {
  vi.useRealTimers();
});

const steps = () => [mapStep('read', { status: 'done', evidence: 'Read it all.' }), mapStep('build', { after: ['read'] }), mapStep('test', { after: ['build'] })];
const chatWorld = (fields: Partial<World> = {}): World => ({ found: session({ updatedAt: '2026-10-01T09:00:00.000Z' }), messages: [user('Build it')], omitted: 0, turns: [turn()], ...fields });
const part = (wrapper: Awaited<ReturnType<typeof mounted>>, name: string) => wrapper.find(`[data-test="${name}"]`);

async function later(world: World, change: Partial<World>, stamp: string): Promise<void> {
  Object.assign(world, change, { found: session({ ...world.found, updatedAt: stamp }) });
  await vi.advanceTimersByTimeAsync(5_000);
  await flushPromises();
}

describe('the execution map beside the conversation (08 §8.7, ADR 0064)', () => {
  it('M2.4-E231 a map there at the start keeps the panel closed, its button opens it, the list switches between it and an artifact, and QA50-E3 a read with nothing changed opens nothing', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const fake = createFakeKvman();
    const world = chatWorld({ map: executionMap(steps()), artifacts: [artifactSummary({})], artifactContents: { plan: artifactContent({}) } });
    serve(fake, world);
    const wrapper = await mounted(ConversationView, fake, { sessionId: 's1' });
    expect(part(wrapper, 'artifact-panel').exists()).toBe(false);
    await later(world, {}, '2026-10-01T09:00:30.000Z');
    expect(fake.calls.filter((call) => call.name === 'kvcoder.map.get').length).toBeGreaterThan(1);
    expect(part(wrapper, 'artifact-panel').exists()).toBe(false);
    expect(part(wrapper, 'map-toggle').text()).toBe('1/3');
    expect(part(wrapper, 'map-toggle').attributes()).toMatchObject({ 'aria-label': 'Execution map: 1 of 3 done', 'aria-pressed': 'false' });
    await part(wrapper, 'map-toggle').trigger('click');
    await flushPromises();
    expect(part(wrapper, 'execution-map').exists()).toBe(true);
    expect(part(wrapper, 'artifact-picker').text()).toBe('Execution map');
    for (const absent of ['artifact-view-source', 'artifact-copy', 'artifact-meta']) expect(part(wrapper, absent).exists(), absent).toBe(false);
    await choose(wrapper, 'artifact-picker', 'artifact:plan');
    expect(part(wrapper, 'execution-map').exists()).toBe(false);
    expect(part(wrapper, 'artifact-version').exists()).toBe(true);
    expect(part(wrapper, 'map-toggle').attributes('aria-pressed')).toBe('false');
    await choose(wrapper, 'artifact-picker', 'map');
    expect(part(wrapper, 'execution-map').exists()).toBe(true);
    await part(wrapper, 'artifact-close').trigger('click');
    expect(part(wrapper, 'artifact-panel').exists()).toBe(false);
    wrapper.unmount();
  });

  it('M2.4-E232 a map that appears opens the panel on it, and an artifact that appears next takes the panel', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const fake = createFakeKvman();
    const world = chatWorld();
    serve(fake, world);
    const wrapper = await mounted(ConversationView, fake, { sessionId: 's1' });
    expect(part(wrapper, 'map-toggle').exists()).toBe(false);
    await later(world, { map: executionMap(steps()) }, '2026-10-01T09:01:00.000Z');
    expect(part(wrapper, 'execution-map').exists()).toBe(true);
    expect(part(wrapper, 'artifact-title').text()).toBe('Execution map');
    await later(world, { artifacts: [artifactSummary({})], artifactContents: { plan: artifactContent({}) } }, '2026-10-01T09:02:00.000Z');
    expect(part(wrapper, 'execution-map').exists()).toBe(false);
    expect(part(wrapper, 'artifact-picker').text()).toBe('The plan');
    wrapper.unmount();
  });

  it('QA50-H4 an updated map takes the panel from an artifact, and opens a closed panel', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const fake = createFakeKvman();
    const world = chatWorld({ map: executionMap(steps()), artifacts: [artifactSummary({})], artifactContents: { plan: artifactContent({}) } });
    serve(fake, world);
    const wrapper = await mounted(ConversationView, fake, { sessionId: 's1' });
    await part(wrapper, 'artifacts-toggle').trigger('click');
    await flushPromises();
    expect(part(wrapper, 'artifact-picker').text()).toBe('The plan');
    await later(world, { map: executionMap(steps(), { version: 2, updatedAt: '2026-10-01T09:03:00.000Z' }) }, '2026-10-01T09:03:00.000Z');
    expect(part(wrapper, 'execution-map').exists()).toBe(true);
    expect(part(wrapper, 'artifact-picker').text()).toBe('Execution map');
    await part(wrapper, 'artifact-close').trigger('click');
    expect(part(wrapper, 'artifact-panel').exists()).toBe(false);
    await later(world, { map: executionMap(steps(), { version: 3, updatedAt: '2026-10-01T09:04:00.000Z' }) }, '2026-10-01T09:04:00.000Z');
    expect(part(wrapper, 'execution-map').exists()).toBe(true);
    wrapper.unmount();
  });

  it('QA50-H5 of a map and an artifact that both changed, the one updated later is shown, whichever read answers first', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const cases = [
      { held: 'kvcoder.map.get', mapAt: '2026-10-01T09:03:10.000Z', planAt: '2026-10-01T09:03:00.000Z', shows: 'Execution map' },
      { held: 'kvcoder.artifact.list', mapAt: '2026-10-01T09:03:10.000Z', planAt: '2026-10-01T09:03:00.000Z', shows: 'Execution map' },
      { held: 'kvcoder.map.get', mapAt: '2026-10-01T09:03:00.000Z', planAt: '2026-10-01T09:03:10.000Z', shows: 'The plan' },
      { held: 'kvcoder.artifact.list', mapAt: '2026-10-01T09:03:00.000Z', planAt: '2026-10-01T09:03:10.000Z', shows: 'The plan' },
    ] as const;
    for (const { held, mapAt, planAt, shows } of cases) {
      const fake = createFakeKvman();
      const world = chatWorld({ map: executionMap(steps()), artifacts: [artifactSummary({})], artifactContents: { plan: artifactContent({}) } });
      serve(fake, world);
      // The held query answers only when the test lets it, after the other one has.
      let release = (): void => undefined;
      let holding = false;
      const answers = { 'kvcoder.map.get': () => world.map ?? null, 'kvcoder.artifact.list': () => world.artifacts ?? [] };
      fake.handle(held, async () => {
        if (holding) await new Promise<void>((resolve) => (release = resolve));
        return answers[held]();
      });
      const wrapper = await mounted(ConversationView, fake, { sessionId: 's1' });
      holding = true;
      await later(world, {
        map: executionMap(steps(), { version: 2, updatedAt: mapAt }),
        artifacts: [artifactSummary({ version: 2, updatedAt: planAt })],
        artifactContents: { plan: artifactContent({ version: 2, content: '# Plan v2', updatedAt: planAt }) },
      }, '2026-10-01T09:03:10.000Z');
      release();
      await flushPromises();
      expect(part(wrapper, 'artifact-picker').text(), `${held} last, map at ${mapAt}`).toBe(shows);
      wrapper.unmount();
    }
  });

  it('M2.4-E233 an idle chat with steps left says so and offers the map; a running chat, a finished map, and no map say nothing', async () => {
    const shown = async (fields: Partial<World>) => {
      const fake = createFakeKvman();
      serve(fake, chatWorld(fields));
      return mounted(ConversationView, fake, { sessionId: 's1' });
    };
    const left = await shown({ map: executionMap(steps()) });
    expect(part(left, 'map-remaining').text()).toBe('2 steps of the execution map are not done. Show the map Continue');
    await part(left, 'map-show').trigger('click');
    expect(part(left, 'execution-map').exists()).toBe(true);
    const quiet = [
      await shown({ map: executionMap(steps()), found: session({ status: 'running' }) }),
      await shown({ map: executionMap(steps().map((step) => ({ ...step, status: 'done' as const }))) }),
      await shown({}),
    ];
    for (const wrapper of quiet) expect(part(wrapper, 'map-remaining').exists()).toBe(false);
    for (const wrapper of [left, ...quiet]) wrapper.unmount();
  });
});
