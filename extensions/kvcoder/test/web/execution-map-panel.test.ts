import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ConversationView from '../../web/src/ConversationView.vue';
import { createFakeKvman } from './support/fake-kvman.ts';
import { artifactContent, artifactSummary, executionMap, mapStep, mounted, serve, session, turn, user, type World } from './support/fixtures.ts';

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
  it('M2.4-E231 a map there at the start keeps the panel closed, its button opens it, and the tabs switch between it and an artifact', async () => {
    const fake = createFakeKvman();
    serve(fake, chatWorld({ map: executionMap(steps()), artifacts: [artifactSummary({})], artifactContents: { plan: artifactContent({}) } }));
    const wrapper = await mounted(ConversationView, fake, { sessionId: 's1' });
    expect(part(wrapper, 'artifact-panel').exists()).toBe(false);
    expect(part(wrapper, 'map-toggle').text()).toBe('1/3');
    expect(part(wrapper, 'map-toggle').attributes()).toMatchObject({ 'aria-label': 'Execution map: 1 of 3 done', 'aria-pressed': 'false' });
    await part(wrapper, 'map-toggle').trigger('click');
    await flushPromises();
    expect(part(wrapper, 'execution-map').exists()).toBe(true);
    expect(part(wrapper, 'artifact-tab-map').attributes('aria-selected')).toBe('true');
    for (const absent of ['artifact-view-source', 'artifact-copy', 'artifact-meta']) expect(part(wrapper, absent).exists(), absent).toBe(false);
    await part(wrapper, 'artifact-tab-plan').trigger('click');
    await flushPromises();
    expect(part(wrapper, 'execution-map').exists()).toBe(false);
    expect(part(wrapper, 'artifact-version').exists()).toBe(true);
    expect(part(wrapper, 'map-toggle').attributes('aria-pressed')).toBe('false');
    await part(wrapper, 'artifact-tab-map').trigger('click');
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
    expect(part(wrapper, 'artifact-tab-plan').attributes('aria-selected')).toBe('true');
    wrapper.unmount();
  });

  it('M2.4-E233 an idle chat with steps left says so and offers the map; a running chat, a finished map, and no map say nothing', async () => {
    const shown = async (fields: Partial<World>) => {
      const fake = createFakeKvman();
      serve(fake, chatWorld(fields));
      return mounted(ConversationView, fake, { sessionId: 's1' });
    };
    const left = await shown({ map: executionMap(steps()) });
    expect(part(left, 'map-remaining').text()).toBe('2 steps of the execution map are not done. Show the map');
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
