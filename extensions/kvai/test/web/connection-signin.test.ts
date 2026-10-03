import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ConnectionCard from '../../web/src/ConnectionCard.vue';
import { createFakeKvman, mounted, problem, progress, result } from './support/fake-kvman.ts';
import { problemError } from './support/fake-kvman.ts';

const disconnected = { id: 'openai', title: 'OpenAI', builtIn: true, status: 'needsKey', models: 2, connection: null, signIn: true, apiKey: true };
const connected = { ...disconnected, status: 'ready', connection: 'oauth' };

describe('the connection card runs a sign-in (07 §7.2, ADR 0009, 230)', () => {
  it('QA15-H11 the card runs a sign-in', async () => {
    const fake = createFakeKvman();
    let row: unknown = disconnected;
    fake.handle('kvai.provider.get', () => row);
    fake.handle('kvai.provider.signin.start', () => 'job1');
    fake.handle('kvai.provider.signin.answer', () => ({}));
    fake.handle('kvai.provider.signin.cancel', () => ({}));
    const wrapper = await mounted(ConnectionCard, fake, { providerId: 'openai' });
    await wrapper.find('[data-test="signin-button"]').trigger('click');
    await flushPromises();
    expect(fake.calls.find((call) => call.name === 'kvai.provider.signin.start')).toEqual({
      name: 'kvai.provider.signin.start',
      input: { provider: 'openai' },
    });
    expect(wrapper.find('[data-test="key-input"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="disconnect-button"]').exists()).toBe(false);

    fake.emit('job1', progress('@kvman/kvai', { type: 'auth_url', url: 'https://example.com/signin' }));
    await flushPromises();
    const link = wrapper.find('[data-test="signin-link"]');
    expect(link.attributes('href')).toBe('https://example.com/signin');
    expect(link.attributes('target')).toBe('_blank');
    expect(link.attributes('rel')).toContain('noopener noreferrer');
    expect(wrapper.find('[data-test="signin-hint"]').exists()).toBe(true);

    fake.emit('job1', progress('@kvman/kvai', { type: 'device_code', userCode: 'ABCD-1234', verificationUri: 'https://example.com/device', expiresInSeconds: 300 }));
    await flushPromises();
    expect(wrapper.find('[data-test="device-code"]').text()).toContain('ABCD-1234');
    expect(wrapper.find('[data-test="device-link"]').attributes('href')).toBe('https://example.com/device');

    fake.emit('job1', progress('@kvman/kvai', { type: 'prompt', kind: 'text', message: 'Enter your code', placeholder: 'Code' }));
    await flushPromises();
    expect(wrapper.find('[data-test="prompt-message"]').text()).toBe('Enter your code');
    await wrapper.find('[data-test="prompt-input"]').setValue('the-code');
    await wrapper.find('[data-test="prompt-send"]').trigger('click');
    await flushPromises();
    expect(fake.calls.filter((call) => call.name === 'kvai.provider.signin.answer').at(-1)).toEqual({
      name: 'kvai.provider.signin.answer',
      input: { provider: 'openai', answer: 'the-code' },
    });

    fake.emit('job1', progress('@kvman/kvai', { type: 'prompt', kind: 'select', message: 'Pick one', options: [{ id: 'a', label: 'First', description: 'The first' }] }));
    await flushPromises();
    await wrapper.find('[data-test="prompt-option-a"]').trigger('click');
    await flushPromises();
    expect(fake.calls.filter((call) => call.name === 'kvai.provider.signin.answer').at(-1)).toEqual({
      name: 'kvai.provider.signin.answer',
      input: { provider: 'openai', answer: 'a' },
    });

    fake.emit('job1', progress('@kvman/kvai', { type: 'progress' }));
    await flushPromises();
    expect(wrapper.find('[data-test="signin-working"]').text()).toBe('Working…');

    row = connected;
    fake.emit('job1', result({}));
    fake.end('job1');
    await flushPromises();
    expect(fake.refresh).toHaveBeenCalled();
    expect(fake.toast).toHaveBeenCalledWith('kvai.ui.connection.signedIn', {}, 'success');
    await flushPromises();
    expect(wrapper.find('[data-test="connection-line"]').text()).toBe('Connected with your plan');
    wrapper.unmount();

    const fakeCancel = createFakeKvman();
    fakeCancel.handle('kvai.provider.get', () => disconnected);
    fakeCancel.handle('kvai.provider.signin.start', () => 'job9');
    fakeCancel.handle('kvai.provider.signin.cancel', () => ({}));
    const cancelling = await mounted(ConnectionCard, fakeCancel, { providerId: 'openai' });
    await cancelling.find('[data-test="signin-button"]').trigger('click');
    await flushPromises();
    await cancelling.find('[data-test="signin-cancel"]').trigger('click');
    await flushPromises();
    expect(fakeCancel.calls.filter((call) => call.name === 'kvai.provider.signin.cancel')).toEqual([
      { name: 'kvai.provider.signin.cancel', input: { provider: 'openai' } },
    ]);
    cancelling.unmount();
  });

  it('QA15-E18 the card shows a failed sign-in', async () => {
    const fake = createFakeKvman();
    fake.handle('kvai.provider.get', () => disconnected);
    fake.handle('kvai.provider.signin.start', () => 'job2');
    fake.handle('kvai.provider.signin.answer', () => {
      throw problemError('kvai/SIGNIN_NOT_WAITING', { provider: 'openai' });
    });
    const wrapper = await mounted(ConnectionCard, fake, { providerId: 'openai' });
    await wrapper.find('[data-test="signin-button"]').trigger('click');
    await flushPromises();

    fake.emit('job2', progress('@kvman/kvai', { type: 'prompt', kind: 'text', message: 'Enter your code' }));
    await flushPromises();
    await wrapper.find('[data-test="prompt-input"]').setValue('kept-value');
    await wrapper.find('[data-test="prompt-send"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-test="signin-error"]').text()).toContain('waiting for an answer');
    expect(wrapper.find('[data-test="prompt-input"]').exists()).toBe(true);
    expect((wrapper.find('[data-test="prompt-input"]').element as HTMLInputElement).value).toBe('kept-value');

    fake.emit('job2', problem('kvai/SIGNIN_FAILED', { provider: 'openai', reason: 'no' }));
    fake.end('job2');
    await flushPromises();
    expect(wrapper.find('[data-test="signin-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="signin-error"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="connection-line"]').text()).toBe('Connect it to use its models.');
    wrapper.unmount();

    const fakeStart = createFakeKvman();
    fakeStart.handle('kvai.provider.get', () => disconnected);
    fakeStart.handle('kvai.provider.signin.start', () => {
      throw problemError('kvai/SIGNIN_UNSUPPORTED', { provider: 'openai' });
    });
    const rejected = await mounted(ConnectionCard, fakeStart, { providerId: 'openai' });
    await rejected.find('[data-test="signin-button"]').trigger('click');
    await flushPromises();
    expect(rejected.find('[data-test="signin-button"]').exists()).toBe(true);
    expect(rejected.find('[data-test="signin-error"]').text()).toContain('no plan sign-in');
    expect(rejected.find('[data-test="connection-line"]').text()).toBe('Connect it to use its models.');
    rejected.unmount();
  });
});
