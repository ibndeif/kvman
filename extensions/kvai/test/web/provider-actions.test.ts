import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ProviderPage from '../../web/src/ProviderPage.vue';
import { createFakeKvman, mounted, problemError, type FakeKvman } from './support/fake-kvman.ts';

const keyed = { id: 'anthropic', title: 'Anthropic', builtIn: true, status: 'ready', models: 3, connection: 'apiKey', signIn: true, apiKey: true };
const custom = { id: 'mine', title: 'Mine', builtIn: false, status: 'noKey', models: 1, connection: null, signIn: false, apiKey: true };
const customKeyed = { ...custom, status: 'ready', connection: 'apiKey' };
const codex = { id: 'openai-codex', title: 'Codex', builtIn: true, status: 'ready', models: 2, connection: 'oauth', signIn: true, apiKey: false };

function serve(fake: FakeKvman, row: unknown): void {
  fake.handle('kvai.provider.get', () => row);
  fake.handle('kvai.model.list', () => []);
}

describe('disconnect, remove, and failures on the Provider page (ADR 0009, 246)', () => {
  it('QA15-H12 Disconnect and Remove ask first', async () => {
    const fake = createFakeKvman();
    serve(fake, keyed);
    fake.handle('kvai.provider.disconnect', () => ({}));
    const wrapper = await mounted(ProviderPage, fake, { providerId: 'anthropic' });
    await wrapper.find('[data-test="disconnect-button"]').trigger('click');
    expect(wrapper.find('[data-test="disconnect-confirm"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="disconnect-confirm"]').text()).toContain('Anthropic');
    expect(fake.calls.filter((call) => call.name === 'kvai.provider.disconnect')).toEqual([]);
    await wrapper.find('[data-test="disconnect-cancel"]').trigger('click');
    expect(wrapper.find('[data-test="disconnect-confirm"]').exists()).toBe(false);
    await wrapper.find('[data-test="disconnect-button"]').trigger('click');
    await wrapper.find('[data-test="disconnect-confirm-button"]').trigger('click');
    await flushPromises();
    expect(fake.calls.filter((call) => call.name === 'kvai.provider.disconnect')).toEqual([{ name: 'kvai.provider.disconnect', input: { provider: 'anthropic' } }]);
    expect(fake.toast).toHaveBeenCalledWith('kvai.ui.connection.disconnected', {}, 'success');
    wrapper.unmount();

    const mine = createFakeKvman();
    serve(mine, customKeyed);
    mine.handle('kvai.provider.remove', () => ({}));
    const second = await mounted(ProviderPage, mine, { providerId: 'mine' });
    await second.find('[data-test="remove-button"]').trigger('click');
    expect(second.find('[data-test="remove-confirm"]').exists()).toBe(true);
    await second.find('[data-test="remove-cancel"]').trigger('click');
    expect(mine.calls.filter((call) => call.name === 'kvai.provider.remove')).toEqual([]);
    await second.find('[data-test="remove-button"]').trigger('click');
    await second.find('[data-test="remove-confirm-button"]').trigger('click');
    await flushPromises();
    expect(mine.calls.filter((call) => call.name === 'kvai.provider.remove')).toEqual([{ name: 'kvai.provider.remove', input: { id: 'mine' } }]);
    expect(mine.toast).toHaveBeenCalledWith('kvai.ui.connection.removed', {}, 'success');
    expect(mine.navigate).toHaveBeenCalledWith('kvai.models');
    second.unmount();
  });

  it('QA15-E19 the section hides what does not apply', async () => {
    const fake = createFakeKvman();
    serve(fake, codex);
    const wrapper = await mounted(ProviderPage, fake, { providerId: 'openai-codex' });
    expect(wrapper.find('[data-test="connected-card"]').text()).toContain('Connected with your plan');
    expect(wrapper.find('[data-test="choice-key"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="other-key"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="remove-button"]').exists()).toBe(false);
    wrapper.unmount();

    const builtIn = createFakeKvman();
    serve(builtIn, keyed);
    const connected = await mounted(ProviderPage, builtIn, { providerId: 'anthropic' });
    expect(connected.find('[data-test="remove-button"]').exists()).toBe(false);
    connected.unmount();

    const mine = createFakeKvman();
    serve(mine, custom);
    const alone = await mounted(ProviderPage, mine, { providerId: 'mine' });
    expect(alone.find('[data-test="choice-key"]').exists()).toBe(true);
    expect(alone.find('[data-test="choice-plan"]').exists()).toBe(false);
    expect(alone.find('[data-test="disconnect-button"]').exists()).toBe(false);
    expect(alone.find('[data-test="remove-button"]').exists()).toBe(true);
    alone.unmount();
  });

  it('QA15-E21 a failed Disconnect, Remove, or key save shows its error and changes nothing', async () => {
    const fake = createFakeKvman();
    serve(fake, keyed);
    fake.handle('kvai.provider.disconnect', () => {
      throw problemError('kvai/PROVIDER_UNKNOWN', { provider: 'anthropic' });
    });
    const wrapper = await mounted(ProviderPage, fake, { providerId: 'anthropic' });
    await wrapper.find('[data-test="disconnect-button"]').trigger('click');
    await wrapper.find('[data-test="disconnect-confirm-button"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-test="actions-error"]').text()).toBe("There's no provider anthropic.");
    expect(wrapper.find('[data-test="actions-error"]').attributes('role')).toBe('alert');
    expect(fake.toast).not.toHaveBeenCalled();
    expect(wrapper.find('[data-test="connected-card"]').exists()).toBe(true);
    wrapper.unmount();

    const mine = createFakeKvman();
    serve(mine, customKeyed);
    mine.handle('kvai.provider.remove', () => {
      throw new Error('connection reset');
    });
    const second = await mounted(ProviderPage, mine, { providerId: 'mine' });
    await second.find('[data-test="remove-button"]').trigger('click');
    await second.find('[data-test="remove-confirm-button"]').trigger('click');
    await flushPromises();
    expect(second.find('[data-test="actions-error"]').text()).toBe('Something went wrong. Try again.');
    expect(mine.navigate).not.toHaveBeenCalled();
    second.unmount();

    const keyedFail = createFakeKvman();
    serve(keyedFail, custom);
    keyedFail.handle('kvai.provider.key.set', () => {
      throw problemError('kvai/PROVIDER_UNKNOWN', { provider: 'mine' });
    });
    const third = await mounted(ProviderPage, keyedFail, { providerId: 'mine' });
    await third.find('[data-test="key-input"]').setValue('kept-key');
    await third.find('[data-test="key-save"]').trigger('click');
    await flushPromises();
    expect(third.find('[data-test="key-error"]').text()).toBe("There's no provider mine.");
    expect((third.find('[data-test="key-input"]').element as HTMLInputElement).value).toBe('kept-key');
    third.unmount();
  });

  it('QA16-E8 Disconnect, Remove, and failures keep working in the new section', async () => {
    const fake = createFakeKvman();
    serve(fake, keyed);
    const wrapper = await mounted(ProviderPage, fake, { providerId: 'anthropic' });
    expect(wrapper.find('[data-test="connected-card"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="disconnect-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="remove-button"]').exists()).toBe(false);
    wrapper.unmount();

    const mine = createFakeKvman();
    serve(mine, custom);
    const second = await mounted(ProviderPage, mine, { providerId: 'mine' });
    expect(second.find('[data-test="remove-button"]').exists()).toBe(true);
    expect(second.find('[data-test="disconnect-button"]').exists()).toBe(false);
    second.unmount();
  });
});
