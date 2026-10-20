import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import type { PickerModel } from '../../web/src/picker-models.ts';
import type { ProviderRow } from '../../web/src/provider-groups.ts';
import ProvidersPage from '../../web/src/ProvidersPage.vue';
import { createFakeKvman, mounted } from './support/fake-kvman.ts';

// Counts that read as words (ADR 0098, 3): kvai's provider and model counts read right at one.
const relay: ProviderRow = { id: 'relay', title: 'Relay', builtIn: false, status: 'ready', models: 1, connection: null, signIn: false, apiKey: false };
const one: PickerModel = { id: 'relay/r1', name: 'Relay One', provider: 'relay' };

describe('kvai counts in words (ADR 0098, 3)', () => {
  it('QA66-H9 one provider, one model, and a picker of one model read in the singular', async () => {
    const fake = createFakeKvman();
    fake.handle('kvai.provider.list', () => [relay]);
    fake.handle('kvai.model.default.get', () => ({ id: 'relay/r1', name: 'Relay One', ready: true }));
    fake.handle('kvai.model.list', () => [one]);
    const wrapper = await mounted(ProvidersPage, fake);
    expect(wrapper.find('[data-test="connected-count"]').text()).toBe('1 provider');
    expect(wrapper.find('[data-test="connected-models"]').text()).toBe('1 model');
    await wrapper.find('[data-test="change-model"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-test="picker-count"]').text()).toBe('1 of 1 model');
    wrapper.unmount();
  });
});
