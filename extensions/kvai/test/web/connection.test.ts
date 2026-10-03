import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ConnectionCard from '../../web/src/ConnectionCard.vue';
import { createFakeKvman, mounted, problemError } from './support/fake-kvman.ts';

const anthropic = { id: 'anthropic', title: 'Anthropic', builtIn: true, status: 'ready', models: 3, connection: 'apiKey', signIn: true, apiKey: true };
const custom = { id: 'mine', title: 'Mine', builtIn: false, status: 'noKey', models: 1, connection: null, signIn: false, apiKey: true };
const openai = { id: 'openai', title: 'OpenAI', builtIn: true, status: 'needsKey', models: 2, connection: null, signIn: true, apiKey: true };

function serve(fake: ReturnType<typeof createFakeKvman>, row: unknown): void {
  fake.handle('kvai.provider.get', () => row);
}

async function textWithoutKeys(fake: ReturnType<typeof createFakeKvman>, row: unknown): Promise<string> {
  const wrapper = await mounted(ConnectionCard, fake, { providerId: (row as { id: string }).id });
  const text = wrapper.text();
  wrapper.unmount();
  return text;
}

describe('the connection card (07 §7.3, ADR 0009, 237)', () => {
  it('QA15-H10 the connection card follows the state', async () => {
    const fake = createFakeKvman();
    serve(fake, anthropic);
    const connected = await mounted(ConnectionCard, fake, { providerId: 'anthropic' });
    expect(connected.find('[data-test="key-input"]').exists()).toBe(true);
    expect(connected.find('[data-test="signin-button"]').text()).toBe('Sign in with your plan');
    expect(connected.find('[data-test="disconnect-button"]').exists()).toBe(true);
    expect(connected.find('[data-test="connection-line"]').text()).toBe('Connected by API key');
    connected.unmount();

    const fakeCustom = createFakeKvman();
    serve(fakeCustom, custom);
    const mine = await mounted(ConnectionCard, fakeCustom, { providerId: 'mine' });
    expect(mine.find('[data-test="key-input"]').exists()).toBe(true);
    expect(mine.find('[data-test="signin-button"]').exists()).toBe(false);
    expect(mine.find('[data-test="remove-button"]').exists()).toBe(true);
    expect(mine.find('[data-test="disconnect-button"]').exists()).toBe(false);
    expect(mine.find('[data-test="connection-line"]').text()).toBe('No key. Fine for a local server.');
    mine.unmount();

    const fakeOpen = createFakeKvman();
    serve(fakeOpen, openai);
    const alone = await mounted(ConnectionCard, fakeOpen, { providerId: 'openai' });
    expect(alone.find('[data-test="disconnect-button"]').exists()).toBe(false);
    expect(alone.find('[data-test="connection-line"]').text()).toBe('Connect it to use its models.');
    alone.unmount();

    for (const language of ['en', 'ar'] as const) {
      for (const row of [anthropic, custom, openai]) {
        const check = createFakeKvman();
        check.language.value = language;
        check.handle('kvai.provider.get', () => row);
        expect(await textWithoutKeys(check, row)).not.toContain('kvai.');
      }
    }
  });

  it('QA15-H12 Disconnect and Remove ask first', async () => {
    const fake = createFakeKvman();
    serve(fake, anthropic);
    fake.handle('kvai.provider.disconnect', () => ({}));
    const wrapper = await mounted(ConnectionCard, fake, { providerId: 'anthropic' });
    await wrapper.find('[data-test="disconnect-button"]').trigger('click');
    expect(wrapper.find('[data-test="disconnect-confirm"]').exists()).toBe(true);
    expect(fake.calls.filter((call) => call.name === 'kvai.provider.disconnect')).toEqual([]);
    await wrapper.find('[data-test="disconnect-cancel"]').trigger('click');
    expect(wrapper.find('[data-test="disconnect-confirm"]').exists()).toBe(false);
    expect(fake.calls.filter((call) => call.name === 'kvai.provider.disconnect')).toEqual([]);
    await wrapper.find('[data-test="disconnect-button"]').trigger('click');
    await wrapper.find('[data-test="disconnect-confirm-button"]').trigger('click');
    await flushPromises();
    expect(fake.calls.filter((call) => call.name === 'kvai.provider.disconnect')).toEqual([{ name: 'kvai.provider.disconnect', input: { provider: 'anthropic' } }]);
    expect(fake.toast).toHaveBeenCalledWith('kvai.ui.connection.disconnected', {}, 'success');
    wrapper.unmount();

    const fakeCustom = createFakeKvman();
    serve(fakeCustom, custom);
    fakeCustom.handle('kvai.provider.remove', () => ({}));
    const mine = await mounted(ConnectionCard, fakeCustom, { providerId: 'mine' });
    await mine.find('[data-test="remove-button"]').trigger('click');
    expect(mine.find('[data-test="remove-confirm"]').exists()).toBe(true);
    await mine.find('[data-test="remove-cancel"]').trigger('click');
    expect(fakeCustom.calls.filter((call) => call.name === 'kvai.provider.remove')).toEqual([]);
    await mine.find('[data-test="remove-button"]').trigger('click');
    await mine.find('[data-test="remove-confirm-button"]').trigger('click');
    await flushPromises();
    expect(fakeCustom.calls.filter((call) => call.name === 'kvai.provider.remove')).toEqual([{ name: 'kvai.provider.remove', input: { id: 'mine' } }]);
    expect(fakeCustom.toast).toHaveBeenCalledWith('kvai.ui.connection.removed', {}, 'success');
    expect(fakeCustom.navigate).toHaveBeenCalledWith('kvai.models');
    mine.unmount();
  });

  it('QA15-E19 the card hides what does not apply', async () => {
    const codex = { id: 'openai-codex', title: 'Codex', builtIn: true, status: 'ready', models: 2, connection: 'oauth', signIn: true, apiKey: false };
    const fake = createFakeKvman();
    serve(fake, codex);
    const wrapper = await mounted(ConnectionCard, fake, { providerId: 'openai-codex' });
    expect(wrapper.find('[data-test="key-input"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="remove-button"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="connection-line"]').text()).toBe('Connected with your plan');
    expect(wrapper.find('[data-test="connection-badge"]').attributes('data-tone')).toBe('success');
    expect(wrapper.find('[data-test="signin-terms"]').text()).toContain("provider's terms");
    wrapper.unmount();

    const fakeBuiltIn = createFakeKvman();
    serve(fakeBuiltIn, anthropic);
    const builtIn = await mounted(ConnectionCard, fakeBuiltIn, { providerId: 'anthropic' });
    expect(builtIn.find('[data-test="remove-button"]').exists()).toBe(false);
    expect(builtIn.find('[data-test="connection-badge"]').attributes('data-tone')).toBe('success');
    builtIn.unmount();
  });

  it('QA15-E21 a failed Disconnect, Remove, or Cancel shows its error and changes nothing', async () => {
    const fake = createFakeKvman();
    serve(fake, anthropic);
    fake.handle('kvai.provider.disconnect', () => {
      throw problemError('kvai/PROVIDER_UNKNOWN', { provider: 'anthropic' });
    });
    const wrapper = await mounted(ConnectionCard, fake, { providerId: 'anthropic' });
    await wrapper.find('[data-test="disconnect-button"]').trigger('click');
    await wrapper.find('[data-test="disconnect-confirm-button"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-test="actions-error"]').text()).toBe("There's no provider anthropic.");
    expect(fake.toast).not.toHaveBeenCalled();
    expect(wrapper.find('[data-test="connection-line"]').text()).toBe('Connected by API key');
    wrapper.unmount();

    const fakeCustom = createFakeKvman();
    serve(fakeCustom, custom);
    fakeCustom.handle('kvai.provider.remove', () => {
      throw new Error('connection reset');
    });
    const mine = await mounted(ConnectionCard, fakeCustom, { providerId: 'mine' });
    await mine.find('[data-test="remove-button"]').trigger('click');
    await mine.find('[data-test="remove-confirm-button"]').trigger('click');
    await flushPromises();
    expect(mine.find('[data-test="actions-error"]').text()).toBe('Something went wrong. Try again.');
    expect(fakeCustom.navigate).not.toHaveBeenCalled();
    mine.unmount();
  });

  it('QA15-E20 the card is right to left in Arabic', () => {
    const css = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'web', 'styles', 'kvai.css'), 'utf8');
    for (const forbidden of ['margin-left', 'margin-right', 'padding-left', 'padding-right', 'left:', 'right:', 'border-left', 'border-right', 'text-align: left', 'text-align: right']) {
      expect(css, forbidden).not.toContain(forbidden);
    }
  });
});
