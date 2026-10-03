import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ProviderPage from '../../web/src/ProviderPage.vue';
import { createFakeKvman, mounted, problem, problemError, progress, result } from './support/fake-kvman.ts';

const disconnected = { id: 'openai', title: 'OpenAI', builtIn: true, status: 'needsKey', models: 2, connection: null, signIn: true, apiKey: true };
const connected = { ...disconnected, status: 'ready', connection: 'oauth' };

describe('a sign-in in the new layout (07 §7.2, ADR 0009, 246)', () => {
  it('QA16-H11 every sign-in behaviour holds in the new section', async () => {
    const fake = createFakeKvman();
    let row: unknown = disconnected;
    fake.handle('kvai.provider.get', () => row);
    fake.handle('kvai.model.list', () => []);
    fake.handle('kvai.provider.signin.start', () => 'job1');
    fake.handle('kvai.provider.signin.answer', () => ({}));
    fake.handle('kvai.provider.signin.cancel', () => ({}));
    const wrapper = await mounted(ProviderPage, fake, { providerId: 'openai' });
    await wrapper.find('[data-test="signin-button"]').trigger('click');
    await flushPromises();
    expect(fake.calls.find((call) => call.name === 'kvai.provider.signin.start')).toEqual({ name: 'kvai.provider.signin.start', input: { provider: 'openai' } });
    expect(wrapper.find('[data-test="signin-panel"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="choices"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="connected-card"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="signin-starting"]').text()).toBe('Preparing the sign-in…');

    fake.emit('job1', progress('@kvman/kvai', { type: 'auth_url', url: 'https://example.com/signin' }));
    await flushPromises();
    const link = wrapper.find('[data-test="signin-link"]');
    expect(link.attributes('href')).toBe('https://example.com/signin');
    expect(link.attributes('target')).toBe('_blank');
    expect(link.attributes('rel')).toContain('noopener noreferrer');
    expect(link.text()).toBe('Open the sign-in page again');

    fake.emit('job1', progress('@kvman/kvai', { type: 'device_code', userCode: 'ABCD-1234', verificationUri: 'https://example.com/device' }));
    await flushPromises();
    expect(wrapper.find('[data-test="device-code"]').text()).toContain('ABCD-1234');
    expect(wrapper.find('[data-test="device-link"]').attributes('href')).toBe('https://example.com/device');

    fake.emit('job1', progress('@kvman/kvai', { type: 'prompt', kind: 'text', message: 'Enter your code', placeholder: 'Code' }));
    await flushPromises();
    expect(wrapper.find('[data-test="prompt-message"]').text()).toBe('Enter your code');
    await wrapper.find('[data-test="prompt-input"]').setValue('the-code');
    await wrapper.find('[data-test="prompt-send"]').trigger('click');
    await flushPromises();
    expect(fake.calls.filter((call) => call.name === 'kvai.provider.signin.answer').at(-1)).toEqual({ name: 'kvai.provider.signin.answer', input: { provider: 'openai', answer: 'the-code' } });

    fake.emit('job1', progress('@kvman/kvai', { type: 'prompt', kind: 'select', message: 'Pick one', options: [{ id: 'a', label: 'First', description: 'The first' }] }));
    await flushPromises();
    await wrapper.find('[data-test="prompt-option-a"]').trigger('click');
    await flushPromises();
    expect(fake.calls.filter((call) => call.name === 'kvai.provider.signin.answer').at(-1)).toEqual({ name: 'kvai.provider.signin.answer', input: { provider: 'openai', answer: 'a' } });

    fake.emit('job1', progress('@kvman/kvai', { type: 'progress' }));
    await flushPromises();
    expect(wrapper.find('[data-test="signin-working"]').text()).toBe('Working…');
    expect(wrapper.find('[data-test="signin-working"]').attributes('role')).toBe('status');

    row = connected;
    fake.emit('job1', result({}));
    fake.end('job1');
    await flushPromises();
    expect(fake.refresh).toHaveBeenCalled();
    expect(fake.toast).toHaveBeenCalledWith('kvai.ui.connection.signedIn', {}, 'success');
    await flushPromises();
    expect(wrapper.find('[data-test="connected-card"]').text()).toContain('Connected with your plan');
    wrapper.unmount();

    const cancelling = createFakeKvman();
    cancelling.handle('kvai.provider.get', () => disconnected);
    cancelling.handle('kvai.model.list', () => []);
    cancelling.handle('kvai.provider.signin.start', () => 'job9');
    cancelling.handle('kvai.provider.signin.cancel', () => ({}));
    const second = await mounted(ProviderPage, cancelling, { providerId: 'openai' });
    await second.find('[data-test="signin-button"]').trigger('click');
    await flushPromises();
    await second.find('[data-test="signin-cancel"]').trigger('click');
    await flushPromises();
    expect(cancelling.calls.filter((call) => call.name === 'kvai.provider.signin.cancel')).toEqual([{ name: 'kvai.provider.signin.cancel', input: { provider: 'openai' } }]);
    second.unmount();

    const bad = createFakeKvman();
    bad.handle('kvai.provider.get', () => disconnected);
    bad.handle('kvai.model.list', () => []);
    bad.handle('kvai.provider.signin.start', () => 'job7');
    bad.handle('kvai.provider.signin.cancel', () => ({}));
    const third = await mounted(ProviderPage, bad, { providerId: 'openai' });
    await third.find('[data-test="signin-button"]').trigger('click');
    await flushPromises();
    bad.emit('job7', progress('@kvman/kvai', { type: 'auth_url', url: 'ftp://example.com/in' }));
    await flushPromises();
    expect(third.find('[data-test="signin-link"]').exists()).toBe(false);
    third.unmount();
  });

  it('QA15-E18 a failed sign-in or answer shows its error and keeps the section', async () => {
    const fake = createFakeKvman();
    fake.handle('kvai.provider.get', () => disconnected);
    fake.handle('kvai.model.list', () => []);
    fake.handle('kvai.provider.signin.start', () => 'job2');
    fake.handle('kvai.provider.signin.answer', () => {
      throw problemError('kvai/SIGNIN_NOT_WAITING', { provider: 'openai' });
    });
    const wrapper = await mounted(ProviderPage, fake, { providerId: 'openai' });
    await wrapper.find('[data-test="signin-button"]').trigger('click');
    await flushPromises();
    fake.emit('job2', progress('@kvman/kvai', { type: 'prompt', kind: 'text', message: 'Enter your code' }));
    await flushPromises();
    await wrapper.find('[data-test="prompt-input"]').setValue('kept-value');
    await wrapper.find('[data-test="prompt-send"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-test="signin-error"]').text()).toContain('waiting for an answer');
    expect((wrapper.find('[data-test="prompt-input"]').element as HTMLInputElement).value).toBe('kept-value');
    fake.emit('job2', problem('kvai/SIGNIN_FAILED', { provider: 'openai', reason: 'no' }));
    fake.end('job2');
    await flushPromises();
    expect(wrapper.find('[data-test="signin-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="signin-error"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="choices"]').exists()).toBe(true);
    wrapper.unmount();

    const failing = createFakeKvman();
    failing.handle('kvai.provider.get', () => disconnected);
    failing.handle('kvai.model.list', () => []);
    failing.handle('kvai.provider.signin.start', () => {
      throw problemError('kvai/SIGNIN_UNSUPPORTED', { provider: 'openai' });
    });
    const rejected = await mounted(ProviderPage, failing, { providerId: 'openai' });
    await rejected.find('[data-test="signin-button"]').trigger('click');
    await flushPromises();
    expect(rejected.find('[data-test="signin-button"]').exists()).toBe(true);
    expect(rejected.find('[data-test="signin-error"]').text()).toContain('no plan sign-in');
    rejected.unmount();
  });

  it('QA16-E9 switching the provider cancels a running sign-in and reads the new one', async () => {
    const fake = createFakeKvman();
    const rows: Record<string, unknown> = { openai: disconnected, anthropic: { ...disconnected, id: 'anthropic', title: 'Anthropic' } };
    fake.handle('kvai.provider.get', (input) => rows[String(input['id'])]);
    fake.handle('kvai.model.list', () => []);
    fake.handle('kvai.provider.signin.start', () => 'job3');
    fake.handle('kvai.provider.signin.cancel', () => ({}));
    const wrapper = await mounted(ProviderPage, fake, { providerId: 'openai' });
    await wrapper.find('[data-test="signin-button"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-test="signin-panel"]').exists()).toBe(true);
    await wrapper.setProps({ providerId: 'anthropic' });
    await flushPromises();
    await flushPromises();
    expect(fake.calls).toContainEqual({ name: 'kvai.provider.get', input: { id: 'anthropic' } });
    expect(fake.calls).toContainEqual({ name: 'kvai.provider.signin.cancel', input: { provider: 'openai' } });
    wrapper.unmount();
  });
});
