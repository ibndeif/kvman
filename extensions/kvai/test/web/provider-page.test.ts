import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ProviderPage from '../../web/src/ProviderPage.vue';
import { createFakeKvman, mounted, problem, problemError, progress, type FakeKvman } from './support/fake-kvman.ts';

const openaiPlan = { id: 'openai', title: 'OpenAI', builtIn: true, status: 'ready', models: 44, connection: 'oauth', signIn: true, apiKey: true };
const openaiKey = { ...openaiPlan, connection: 'apiKey' };
const anthropic = { id: 'anthropic', title: 'Anthropic', builtIn: true, status: 'needsKey', models: 3, connection: null, signIn: true, apiKey: true };
const codex = { id: 'openai-codex', title: 'Codex', builtIn: true, status: 'needsKey', models: 2, connection: null, signIn: true, apiKey: false };
const custom = { id: 'relay', title: 'Relay', builtIn: false, status: 'noKey', models: 2, connection: null, signIn: false, apiKey: true };

function serve(fake: FakeKvman, row: unknown): void {
  fake.handle('kvai.provider.get', () => row);
  fake.handle('kvai.model.list', () => []);
}

describe('the Provider page (07 §7.3, ADR 0009, 245)', () => {
  it('QA16-H9 the header and a connected provider with the other method', async () => {
    const fake = createFakeKvman();
    serve(fake, openaiPlan);
    fake.handle('kvai.provider.key.set', () => ({}));
    const wrapper = await mounted(ProviderPage, fake, { providerId: 'openai' });
    expect(fake.calls).toContainEqual({ name: 'kvai.provider.get', input: { id: 'openai' } });
    expect(wrapper.find('[data-test="avatar"]').text()).toBe('O');
    expect(wrapper.find('.kvai-provider-title').text()).toBe('OpenAI');
    expect(wrapper.find('[data-test="provider-sub"]').text()).toBe('openai · 44 models');
    expect(wrapper.find('[data-test="provider-chip"]').text()).toBe('Connected');
    const card = wrapper.find('[data-test="connected-card"]');
    expect(card.text()).toContain('Connected with your plan');
    expect(wrapper.find('[data-test="disconnect-button"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Prefer an API key instead?');
    expect(wrapper.find('[data-test="key-input"]').exists()).toBe(false);
    await wrapper.find('[data-test="other-key"]').trigger('click');
    expect(wrapper.find('[data-test="key-input"]').exists()).toBe(true);
    await wrapper.find('[data-test="key-input"]').setValue('sk-live');
    await wrapper.find('[data-test="key-save"]').trigger('click');
    await flushPromises();
    expect(fake.calls).toContainEqual({ name: 'kvai.provider.key.set', input: { provider: 'openai', key: 'sk-live' } });
    expect(fake.toast).toHaveBeenCalledWith('kvai.ui.key.saved', {}, 'success');
    await wrapper.find('[data-test="back"]').trigger('click');
    expect(fake.navigate).toHaveBeenCalledWith('kvai.models');
    wrapper.unmount();

    const keyed = createFakeKvman();
    serve(keyed, openaiKey);
    const keyedWrapper = await mounted(ProviderPage, keyed, { providerId: 'openai' });
    expect(keyedWrapper.find('[data-test="connected-card"]').text()).toContain('Connected by API key');
    expect(keyedWrapper.text()).toContain('Prefer your plan?');
    expect(keyedWrapper.find('[data-test="signin-button"]').exists()).toBe(true);
    expect(keyedWrapper.find('[data-test="signin-terms"]').exists()).toBe(true);
    keyedWrapper.unmount();
  });

  it('QA16-H10 a provider that is not connected shows its choices', async () => {
    const fake = createFakeKvman();
    serve(fake, anthropic);
    const wrapper = await mounted(ProviderPage, fake, { providerId: 'anthropic' });
    expect(wrapper.find('[data-test="choices"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Connect Anthropic');
    expect(wrapper.text()).toContain('Choose how kvman reaches Anthropic.');
    const plan = wrapper.find('[data-test="choice-plan"]');
    expect(plan.attributes('data-highlight')).toBe('true');
    expect(plan.text()).toContain('Your plan');
    expect(wrapper.find('[data-test="signin-button"]').text()).toBe('Sign in with your plan');
    expect(wrapper.find('[data-test="signin-terms"]').exists()).toBe(true);
    const input = wrapper.find('[data-test="key-input"]');
    expect(input.exists()).toBe(true);
    expect(input.attributes('type')).toBe('password');
    expect(input.attributes('autocomplete')).toBe('off');
    const order = wrapper.find('[data-test="choices"]').html();
    expect(order.indexOf('choice-plan')).toBeLessThan(order.indexOf('choice-key'));
    wrapper.unmount();

    const planOnly = createFakeKvman();
    serve(planOnly, codex);
    const only = await mounted(ProviderPage, planOnly, { providerId: 'openai-codex' });
    expect(only.find('[data-test="choice-plan"]').exists()).toBe(true);
    expect(only.find('[data-test="choice-key"]').exists()).toBe(false);
    only.unmount();

    const keyOnly = createFakeKvman();
    serve(keyOnly, custom);
    const mine = await mounted(ProviderPage, keyOnly, { providerId: 'relay' });
    expect(mine.find('[data-test="choice-plan"]').exists()).toBe(false);
    expect(mine.find('[data-test="choice-key"]').exists()).toBe(true);
    expect(mine.text()).toContain('No key. Fine for a local server.');
    expect(mine.find('[data-test="provider-chip"]').text()).toBe('Your own server');
    mine.unmount();
  });

  it('QA16-E3 an unknown provider shows its translated reason and nothing else', async () => {
    const fake = createFakeKvman();
    fake.handle('kvai.provider.get', () => {
      throw problemError('kvai/PROVIDER_UNKNOWN', { provider: 'ghost' });
    });
    fake.handle('kvai.model.list', () => []);
    const wrapper = await mounted(ProviderPage, fake, { providerId: 'ghost' });
    expect(wrapper.find('[data-test="provider-error"]').text()).toBe("There's no provider ghost.");
    expect(wrapper.find('[data-test="provider-error"]').attributes('role')).toBe('alert');
    expect(wrapper.find('[data-test="connected-card"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="provider-models"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('QA16-E6 the styles use logical properties and mirror the chevron right to left', () => {
    for (const file of ['kvai.css', 'provider.css']) {
      const css = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'web', 'styles', file), 'utf8');
      for (const forbidden of ['margin-left', 'margin-right', 'padding-left', 'padding-right', 'left:', 'right:', 'border-left', 'border-right', 'text-align: left', 'text-align: right']) {
        expect(css, `${file}: ${forbidden}`).not.toContain(forbidden);
      }
    }
    const shared = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'web', 'styles', 'kvai.css'), 'utf8');
    expect(shared).toContain(':dir(rtl) .kvai-flip');
  });

  it('QA16-E7 no raw keys in any Provider page state, in English and Arabic', async () => {
    const rows = [anthropic, codex, custom, openaiPlan, openaiKey];
    for (const language of ['en', 'ar'] as const) {
      for (const row of rows) {
        const fake = createFakeKvman();
        fake.language.value = language;
        serve(fake, row);
        const wrapper = await mounted(ProviderPage, fake, { providerId: (row as { id: string }).id });
        expect(wrapper.text(), `${language} ${(row as { id: string }).id}`).not.toContain('kvai.');
        wrapper.unmount();
      }
      const signing = createFakeKvman();
      signing.language.value = language;
      signing.handle('kvai.provider.get', () => anthropic);
      signing.handle('kvai.model.list', () => []);
      signing.handle('kvai.provider.signin.start', () => 'job1');
      signing.handle('kvai.provider.signin.cancel', () => ({}));
      const started = await mounted(ProviderPage, signing, { providerId: 'anthropic' });
      await started.find('[data-test="signin-button"]').trigger('click');
      await flushPromises();
      expect(started.text(), language).not.toContain('kvai.');
      signing.emit('job1', progress('@kvman/kvai', { type: 'auth_url', url: 'https://example.com/in' }));
      await flushPromises();
      expect(started.text(), language).not.toContain('kvai.');
      signing.emit('job1', progress('@kvman/kvai', { type: 'device_code', userCode: 'AB-12', verificationUri: 'https://example.com/d' }));
      await flushPromises();
      expect(started.text(), language).not.toContain('kvai.');
      signing.emit('job1', progress('@kvman/kvai', { type: 'prompt', kind: 'text', message: 'Code?' }));
      await flushPromises();
      expect(started.text(), language).not.toContain('kvai.');
      signing.emit('job1', progress('@kvman/kvai', { type: 'prompt', kind: 'manual_code', message: 'Paste?' }));
      await flushPromises();
      expect(started.text(), language).not.toContain('kvai.');
      signing.emit('job1', progress('@kvman/kvai', { type: 'prompt', kind: 'select', message: 'Pick?', options: [{ id: 'a', label: 'A' }] }));
      await flushPromises();
      expect(started.text(), language).not.toContain('kvai.');
      signing.emit('job1', progress('@kvman/kvai', { type: 'progress' }));
      await flushPromises();
      expect(started.text(), language).not.toContain('kvai.');
      signing.emit('job1', problem('kvai/SIGNIN_FAILED', { provider: 'a', reason: 'no' }));
      signing.end('job1');
      await flushPromises();
      expect(started.text(), language).not.toContain('kvai.');
      started.unmount();
      const failing = createFakeKvman();
      failing.language.value = language;
      failing.handle('kvai.provider.get', () => {
        throw problemError('kvai/PROVIDER_UNKNOWN', { provider: 'ghost' });
      });
      failing.handle('kvai.model.list', () => []);
      const failed = await mounted(ProviderPage, failing, { providerId: 'ghost' });
      expect(failed.text(), language).not.toContain('kvai.');
      failed.unmount();
    }
  });
});
