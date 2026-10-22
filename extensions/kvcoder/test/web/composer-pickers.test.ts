import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import SessionModel from '../../web/src/SessionModel.vue';
import { passesEnd } from '../../web/src/popover-place.ts';
import { createFakeKvman } from './support/fake-kvman.ts';
import { session } from './support/fixtures.ts';

// The composer's pickers at side-bar width (08 §8.7, ADR 0101, 15): one menu open at a time, also from the keyboard, and
// a list that opens toward the inline start when the end has no room.

afterEach(() => document.body.replaceChildren());

describe("the composer's pickers (08 §8.7, ADR 0101, 15)", () => {
  it("M4.7-H14 opening the thinking picker's menu, by the focus or a press, closes the model picker's", async () => {
    const fake = createFakeKvman();
    fake.handle('kvai.provider.list', () => [{ id: 'fake', title: 'Fake', status: 'ready' }]);
    fake.handle('kvai.model.list', () => [{ id: 'fake/big', name: 'Big', provider: 'fake', thinkingLevels: ['off', 'low', 'high'] }]);
    const wrapper = mount(SessionModel, { props: { session: session({ model: 'fake/big', thinking: 'low' }) }, global: { provide: { kvman: fake.kvman } }, attachTo: document.body });
    await flushPromises();
    await wrapper.find('[data-test="model-picker"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('#kvc-models').exists()).toBe(true);
    const thinking = wrapper.find('[data-test="thinking-picker"]');
    thinking.element.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    await thinking.trigger('click');
    await flushPromises();
    expect(wrapper.find('#kvc-models').exists()).toBe(false);
    expect(wrapper.find('[data-test="thinking-picker-list"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('M4.7-H14 a list opens toward the inline start when it would pass the end of its area', () => {
    expect(passesEnd({ left: 140, right: 290 }, { left: 0, right: 257 }, false)).toBe(true);
    expect(passesEnd({ left: 20, right: 170 }, { left: 0, right: 257 }, false)).toBe(false);
    expect(passesEnd({ left: -30, right: 120 }, { left: 0, right: 257 }, true)).toBe(true);
    expect(passesEnd({ left: 10, right: 160 }, { left: 0, right: 257 }, true)).toBe(false);
  });
});
