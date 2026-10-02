import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ConversationHeader from '../../web/src/ConversationHeader.vue';
import ModelPicker from '../../web/src/ModelPicker.vue';
import type { ModelGroup } from '../../web/src/model-groups.ts';
import { searchGroups } from '../../web/src/model-groups.ts';
import { createFakeKvman } from './support/fake-kvman.ts';
import { session } from './support/fixtures.ts';

const groups: ModelGroup[] = [
  { provider: 'openrouter', title: 'OpenRouter', models: [{ id: 'openrouter/z-ai/glm-5.3-flash', name: 'Z.ai: GLM 5.3 Flash' }, { id: 'openrouter/z-ai/glm-4.7-flash', name: 'Z.ai: GLM 4.7 Flash' }, { id: 'openrouter/acme/big-one', name: 'Acme Big One' }] },
  { provider: 'zai', title: 'Z.ai', models: [{ id: 'zai/glm-5.3-flash', name: 'GLM-5.3-Flash' }, { id: 'zai/glm-5.3', name: 'GLM-5.3' }, { id: 'zai/other', name: 'Other' }] },
];

function pickerFor(current: string | null) {
  return mount(ModelPicker, { props: { groups, current }, global: { provide: { kvman: createFakeKvman().kvman } }, attachTo: document.body });
}

const type = async (wrapper: ReturnType<typeof pickerFor>, text: string) => {
  await wrapper.find('[data-test="model-search"]').setValue(text);
  await flushPromises();
};

describe("the model picker's search (08 §8.7, ADR 0009, 140)", () => {
  it('QA3-H1 typing keeps the models with every word, under their groups, with the count, and the keys pick', async () => {
    const wrapper = pickerFor('openrouter/acme/big-one');
    await wrapper.find('[data-test="model-picker"]').trigger('click');
    expect(wrapper.find('[data-test="model-count"]').text()).toBe('6 of 6 models');
    await type(wrapper, 'glm fl');
    expect(wrapper.findAll('[data-test="model-group"]').map((group) => group.text())).toEqual(['OpenRouter', 'Z.ai']);
    expect(wrapper.findAll('[role="option"]').map((option) => option.text())).toEqual(['Z.ai: GLM 5.3 Flash', 'Z.ai: GLM 4.7 Flash', 'GLM-5.3-Flash']);
    expect(wrapper.find('[data-test="model-count"]').text()).toBe('3 of 6 models');
    await type(wrapper, 'ZAI/GLM-5.3');
    expect(wrapper.findAll('[role="option"]').map((option) => option.text())).toEqual(['GLM-5.3-Flash', 'GLM-5.3']);
    const input = wrapper.find('[data-test="model-search"]');
    await input.trigger('keydown', { key: 'ArrowDown' });
    await input.trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('pick')).toEqual([['zai/glm-5.3']]);
    expect(wrapper.find('[data-test="model-popover"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('QA3-H1 picking in the header runs kvcoder.session.configure with the model', async () => {
    const fake = createFakeKvman();
    fake.handle('kvai.provider.list', () => [{ id: 'zai', title: 'Z.ai', status: 'ready' }]);
    fake.handle('kvai.model.list', () => [{ id: 'zai/glm-5.3', name: 'GLM-5.3', provider: 'zai' }, { id: 'zai/other', name: 'Other', provider: 'zai' }]);
    const wrapper = mount(ConversationHeader, { props: { session: session({ model: 'zai/other' }), tab: 'chat', turns: 1 }, global: { provide: { kvman: fake.kvman } } });
    await flushPromises();
    await wrapper.find('[data-test="model-picker"]').trigger('click');
    await wrapper.find('[data-test="model-search"]').setValue('glm');
    await wrapper.find('[data-test="model-zai/glm-5.3"]').trigger('click');
    await flushPromises();
    expect(fake.calls.filter((call) => call.name === 'kvcoder.session.configure').map((call) => call.input)).toEqual([{ sessionId: 's1', model: 'zai/glm-5.3' }]);
    wrapper.unmount();
  });

  it('QA3-E1 a search with no match says so, and Enter does nothing', async () => {
    const wrapper = pickerFor(null);
    await wrapper.find('[data-test="model-picker"]').trigger('click');
    await type(wrapper, 'nothing like this');
    expect(wrapper.find('[data-test="model-none"]').text()).toBe('No models match');
    expect(wrapper.find('[data-test="model-count"]').text()).toBe('0 of 6 models');
    await wrapper.find('[data-test="model-search"]').trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('pick')).toBeUndefined();
    expect(wrapper.find('[data-test="model-popover"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('QA3-E2 Esc and a click outside close it with the model unchanged, and focus returns to the button', async () => {
    const wrapper = pickerFor('zai/other');
    const button = wrapper.find('[data-test="model-picker"]');
    await button.trigger('click');
    expect(document.activeElement).toBe(wrapper.find('[data-test="model-search"]').element);
    expect(wrapper.find('[data-test="model-zai/other"]').attributes('aria-selected')).toBe('true');
    await wrapper.find('[data-test="model-popover"]').trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('[data-test="model-popover"]').exists()).toBe(false);
    expect(document.activeElement).toBe(button.element);
    await button.trigger('click');
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await flushPromises();
    expect(wrapper.find('[data-test="model-popover"]').exists()).toBe(false);
    expect(wrapper.emitted('pick')).toBeUndefined();
    wrapper.unmount();
  });

  it('QA3-H1 searchGroups needs every word, ignores case, and counts what is shown and what exists', () => {
    expect(searchGroups(groups, '  FLASH  glm ').shown).toBe(3);
    expect(searchGroups(groups, '').groups).toEqual(groups);
    expect(searchGroups(groups, 'acme openrouter')).toMatchObject({ shown: 1, total: 6 });
  });
});
