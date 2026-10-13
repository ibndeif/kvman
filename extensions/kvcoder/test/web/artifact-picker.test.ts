import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ConversationView from '../../web/src/ConversationView.vue';
import { createFakeKvman } from './support/fake-kvman.ts';
import { artifactContent, artifactSummary, executionMap, mapStep, mounted, serve, session, turn, user, type World } from './support/fixtures.ts';

const report = artifactSummary({ id: 'report', title: 'The report' });
const contents = { plan: artifactContent({}), report: artifactContent({ id: 'report', title: 'The report', content: '# Report' }) };
const chatWorld = (fields: Partial<World>): World => ({ found: session({ updatedAt: '2026-10-01T09:00:00.000Z' }), messages: [user('Build it')], omitted: 0, turns: [turn()], ...fields });
const part = (wrapper: Awaited<ReturnType<typeof mounted>>, name: string) => wrapper.find(`[data-test="${name}"]`);

// A chat with a map and two artifacts, its panel opened on the first artifact.
async function opened(fields: Partial<World> = { map: executionMap([mapStep('read')]), artifacts: [artifactSummary({}), report], artifactContents: contents }) {
  const fake = createFakeKvman();
  serve(fake, chatWorld(fields));
  const wrapper = await mounted(ConversationView, fake, { sessionId: 's1' });
  await part(wrapper, fields.artifacts === undefined ? 'map-toggle' : 'artifacts-toggle').trigger('click');
  await flushPromises();
  return wrapper;
}

describe("the artifact panel's title (08 §8.7, ADR 0071, 1)", () => {
  it('QA50-H1 several things to show are one title with a list of the map and the artifacts', async () => {
    const wrapper = await opened();
    expect(part(wrapper, 'artifact-picker').text()).toBe('The plan');
    expect(part(wrapper, 'artifact-picker').attributes()).toMatchObject({ 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-label': 'Shown in the panel: The plan' });
    expect(wrapper.find('[role="tablist"]').exists()).toBe(false);
    expect(part(wrapper, 'artifact-picker-list').exists()).toBe(false);
    await part(wrapper, 'artifact-picker').trigger('click');
    const options = wrapper.findAll('[data-test="artifact-picker-list"] [role="option"]');
    expect(options.map((option) => option.text())).toEqual(['Execution map', 'The plan', 'The report']);
    expect(options.map((option) => option.attributes('aria-selected'))).toEqual(['false', 'true', 'false']);
    expect(options.map((option) => option.attributes('title'))).toEqual(['Execution map', 'The plan', 'The report']);
    await part(wrapper, 'artifact-picker-artifact:report').trigger('click');
    await flushPromises();
    expect(part(wrapper, 'artifact-body').text()).toContain('# Report');
    expect(part(wrapper, 'artifact-picker').text()).toBe('The report');
    expect(part(wrapper, 'artifact-picker-list').exists()).toBe(false);
    await part(wrapper, 'artifact-picker').trigger('click');
    await part(wrapper, 'artifact-picker-map').trigger('click');
    expect(part(wrapper, 'execution-map').exists()).toBe(true);
    expect(part(wrapper, 'artifact-picker').text()).toBe('Execution map');
    wrapper.unmount();
  });

  it('QA50-H2 Down and Enter pick the next entry, and Escape closes the list with nothing changed', async () => {
    const wrapper = await opened();
    const button = part(wrapper, 'artifact-picker');
    await button.trigger('click');
    await button.trigger('keydown', { key: 'ArrowDown' });
    expect(part(wrapper, 'artifact-picker-artifact:report').attributes('data-active')).toBe('true');
    await button.trigger('keydown', { key: 'Enter' });
    await flushPromises();
    expect(button.text()).toBe('The report');
    await button.trigger('click');
    await button.trigger('keydown', { key: 'ArrowUp' });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flushPromises();
    expect(part(wrapper, 'artifact-picker-list').exists()).toBe(false);
    expect(button.text()).toBe('The report');
    wrapper.unmount();
  });

  it('QA50-E1 one thing to show has a plain title, with no button and no list', async () => {
    const artifact = await opened({ artifacts: [artifactSummary({})], artifactContents: contents });
    const map = await opened({ map: executionMap([mapStep('read')]) });
    expect(part(artifact, 'artifact-title').text()).toBe('The plan');
    expect(part(map, 'artifact-title').text()).toBe('Execution map');
    for (const wrapper of [artifact, map]) {
      expect(part(wrapper, 'artifact-picker').exists()).toBe(false);
      wrapper.unmount();
    }
  });
});
