import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import PreferencesSetting from '../../web/src/PreferencesSetting.vue';
import { createFakeKvman } from './support/fake-kvman.ts';
import { mounted } from './support/fixtures.ts';
import { serveSettings, settingWrites } from './support/settings-world.ts';

// The preferences row of the Agent card (08 §8.7, ADR 0092, 3).
describe('the preferences row (ADR 0092, 3)', () => {
  it('QA60-H6 shows the value, saves the edit in the scope being edited, and shows Changed with a reset', async () => {
    const fake = createFakeKvman();
    serveSettings(fake, { 'kvcoder.preferences': { default: '', global: 'Use pnpm.' } });
    const view = await mounted(PreferencesSetting, fake);
    const text = view.find<HTMLTextAreaElement>('[data-test="preferences-text"]');
    expect(text.element.value).toBe('Use pnpm.');
    expect(view.find('[data-test="preferences-setting-title"]').text()).toBe('Your preferences');
    expect(view.find('[data-test="preferences-setting-changed"]').exists()).toBe(true);
    await text.setValue('Use pnpm.\nNever push.');
    await view.find('[data-test="preferences-save"]').trigger('click');
    await flushPromises();
    expect(settingWrites(fake)).toEqual([{ name: 'kernel.settings.set', input: { key: 'kvcoder.preferences', value: 'Use pnpm.\nNever push.', scope: 'global' } }]);
    expect(view.find('[data-test="preferences-setting-saved"]').exists()).toBe(true);
  });
});
