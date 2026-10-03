import { describe, expect, it } from 'vitest';
import { connectedRows, type ProviderRow } from '../../web/src/provider-groups.ts';
import ProvidersPage from '../../web/src/ProvidersPage.vue';
import { createFakeKvman, mounted } from './support/fake-kvman.ts';

const openai: ProviderRow = { id: 'openai', title: 'OpenAI', builtIn: true, status: 'ready', models: 44, connection: 'oauth', signIn: true, apiKey: true };
const openrouter: ProviderRow = { id: 'openrouter', title: 'OpenRouter', builtIn: true, status: 'ready', models: 398, connection: 'apiKey', signIn: false, apiKey: true };
const relay: ProviderRow = { id: 'relay', title: 'Relay', builtIn: false, status: 'noKey', models: 2, connection: null, signIn: false, apiKey: false };
const anthropic: ProviderRow = { id: 'anthropic', title: 'Anthropic', builtIn: true, status: 'needsKey', models: 3, connection: null, signIn: true, apiKey: true };

const rows = [openai, openrouter, relay, anthropic];

describe('"Connected" (07 §7.3, ADR 0009, 240)', () => {
  it('QA16-H2 Connected lists what is usable with Manage', async () => {
    const fake = createFakeKvman();
    fake.handle('kvai.provider.list', () => rows);
    fake.handle('kvai.model.default.get', () => ({ id: 'openai/gpt-6-luna', name: 'GPT-6 Luna', ready: true }));
    const wrapper = await mounted(ProvidersPage, fake);
    const section = wrapper.find('[data-test="connected-section"]');
    expect(section.find('[data-test="connected-count"]').text()).toBe('3 providers');
    const cards = section.findAll('[data-test="connected-card"]');
    expect(cards).toHaveLength(3);
    expect(cards[0]?.text()).toContain('OpenAI');
    expect(cards[0]?.find('[data-test="connected-models"]').text()).toBe('44 models');
    expect(cards[0]?.find('[data-test="connected-line"]').text()).toBe('Connected with your plan');
    expect(cards[0]?.find('[data-test="connected-default"]').text()).toBe('Default');
    expect(cards[1]?.find('[data-test="connected-line"]').text()).toBe('Connected by API key');
    expect(cards[1]?.find('[data-test="connected-default"]').exists()).toBe(false);
    expect(cards[2]?.find('[data-test="connected-line"]').text()).toBe('Your own server');
    expect(section.text()).not.toContain('Anthropic');
    await cards[0]?.find('[data-test="manage"]').trigger('click');
    expect(fake.navigate).toHaveBeenCalledWith('kvai.provider', { providerId: 'openai' });
    wrapper.unmount();
  });

  it('QA16-E1 with nothing connected the section says so', async () => {
    const fake = createFakeKvman();
    fake.handle('kvai.provider.list', () => [anthropic]);
    fake.handle('kvai.model.default.get', () => ({ id: null, name: null, ready: false }));
    const wrapper = await mounted(ProvidersPage, fake);
    const section = wrapper.find('[data-test="connected-section"]');
    expect(section.findAll('[data-test="connected-card"]')).toHaveLength(0);
    expect(section.find('[data-test="connected-empty"]').text()).toBe('Nothing is connected yet. Pick a provider below.');
    wrapper.unmount();
  });

  it('connectedRows keeps connected providers and every custom one', () => {
    expect(connectedRows(rows).map((row) => row.id)).toEqual(['openai', 'openrouter', 'relay']);
    expect(connectedRows([anthropic])).toEqual([]);
  });
});
