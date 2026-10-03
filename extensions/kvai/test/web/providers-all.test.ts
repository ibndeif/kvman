import { describe, expect, it } from 'vitest';
import { unconnectedBuiltIns, type ProviderRow } from '../../web/src/provider-groups.ts';
import ProvidersPage from '../../web/src/ProvidersPage.vue';
import { createFakeKvman, mounted } from './support/fake-kvman.ts';

function builtIn(index: number): ProviderRow {
  const padded = String(index).padStart(2, '0');
  return { id: `provider-${padded}`, title: `Provider ${padded}`, builtIn: true, status: 'needsKey', models: index, connection: null, signIn: true, apiKey: true };
}

const sixty = Array.from({ length: 60 }, (_, index) => builtIn(index));

describe('"All providers" (07 §7.3, ADR 0009, 242)', () => {
  it('QA16-H4 All providers shows 25 A–Z with Show 25 more', async () => {
    const connected: ProviderRow = { id: 'openai', title: 'OpenAI', builtIn: true, status: 'ready', models: 44, connection: 'oauth', signIn: true, apiKey: true };
    const custom: ProviderRow = { id: 'relay', title: 'Relay', builtIn: false, status: 'noKey', models: 2, connection: null, signIn: false, apiKey: false };
    const fake = createFakeKvman();
    fake.handle('kvai.provider.list', () => [connected, custom, ...sixty]);
    fake.handle('kvai.model.default.get', () => ({ id: 'openai/gpt-6-luna', name: 'GPT-6 Luna', ready: true }));
    const wrapper = await mounted(ProvidersPage, fake);
    const section = wrapper.find('[data-test="all-section"]');
    expect(section.find('[data-test="all-count"]').text()).toBe('60 providers');
    let rows = section.findAll('[data-test="all-row"]');
    expect(rows).toHaveLength(25);
    expect(rows[0]?.text()).toContain('Provider 00');
    expect(rows[0]?.find('[data-test="avatar"]').text()).toBe('P');
    expect(rows[0]?.find('[data-test="all-models"]').text()).toBe('0 models');
    expect(rows[0]?.find('[data-test="connect"]').text()).toBe('Connect');
    expect(section.text()).not.toContain('OpenAI');
    expect(section.text()).not.toContain('Relay');
    await rows[0]?.find('[data-test="connect"]').trigger('click');
    expect(fake.navigate).toHaveBeenCalledWith('kvai.provider', { providerId: 'provider-00' });
    await section.find('[data-test="all-more"]').trigger('click');
    rows = section.findAll('[data-test="all-row"]');
    expect(rows).toHaveLength(50);
    await section.find('[data-test="all-more"]').trigger('click');
    expect(section.findAll('[data-test="all-row"]')).toHaveLength(60);
    expect(section.find('[data-test="all-more"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('QA16-H5 and QA16-E5 search narrows forgivingly and misses cleanly', async () => {
    const providers: ProviderRow[] = [
      { id: 'amazon-bedrock', title: 'Amazon Bedrock', builtIn: true, status: 'needsKey', models: 1, connection: null, signIn: false, apiKey: true },
      { id: 'azure-openai-responses', title: 'Azure OpenAI', builtIn: true, status: 'needsKey', models: 1, connection: null, signIn: false, apiKey: true },
      { id: 'baseten', title: 'Baseten', builtIn: true, status: 'needsKey', models: 1, connection: null, signIn: false, apiKey: true },
    ];
    const fake = createFakeKvman();
    fake.handle('kvai.provider.list', () => providers);
    fake.handle('kvai.model.default.get', () => ({ id: null, name: null, ready: false }));
    const wrapper = await mounted(ProvidersPage, fake);
    const section = wrapper.find('[data-test="all-section"]');
    expect(section.find('[data-test="all-search"]').attributes('placeholder')).toBe('Search 3 providers');
    await section.find('[data-test="all-search"]').setValue('  OPENAI ');
    let rows = section.findAll('[data-test="all-row"]');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.text()).toContain('Azure OpenAI');
    await section.find('[data-test="all-search"]').setValue('zzz');
    expect(section.findAll('[data-test="all-row"]')).toHaveLength(0);
    expect(section.find('[data-test="all-empty"]').text()).toBe('No provider matches.');
    wrapper.unmount();
  });

  it('unconnectedBuiltIns sorts A–Z and leaves out connected and custom providers', () => {
    const rows: ProviderRow[] = [
      { id: 'b', title: 'Beta', builtIn: true, status: 's', models: 1, connection: null, signIn: false, apiKey: true },
      { id: 'a', title: 'Alpha', builtIn: true, status: 's', models: 1, connection: null, signIn: false, apiKey: true },
      { id: 'c', title: 'Gamma', builtIn: true, status: 'r', models: 1, connection: 'oauth', signIn: false, apiKey: true },
      { id: 'd', title: 'Delta', builtIn: false, status: 'n', models: 1, connection: null, signIn: false, apiKey: false },
    ];
    expect(unconnectedBuiltIns(rows).map((row) => row.id)).toEqual(['a', 'b']);
  });
});
