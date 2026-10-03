import { describe, expect, it } from 'vitest';
import { featuredTiles, type ProviderRow } from '../../web/src/provider-groups.ts';
import ProvidersPage from '../../web/src/ProvidersPage.vue';
import { createFakeKvman, mounted } from './support/fake-kvman.ts';

const row = (id: string, connection: 'apiKey' | 'oauth' | null = null): ProviderRow => ({
  id,
  title: id,
  builtIn: true,
  status: 'needsKey',
  models: 1,
  connection,
  signIn: true,
  apiKey: true,
});

const featured = [row('anthropic'), row('openai'), row('github-copilot'), row('google'), row('xai')];

describe('"Connect a provider" (07 §7.3, ADR 0009, 241)', () => {
  it('QA16-H3 the quick-connect tiles open their provider pages', async () => {
    const fake = createFakeKvman();
    fake.handle('kvai.provider.list', () => featured);
    fake.handle('kvai.model.default.get', () => ({ id: null, name: null, ready: false }));
    const wrapper = await mounted(ProvidersPage, fake);
    const section = wrapper.find('[data-test="connect-section"]');
    const plan = section.findAll('[data-test="plan-tile"]');
    expect(plan).toHaveLength(3);
    expect(plan[0]?.text()).toContain('Claude');
    expect(plan[0]?.text()).toContain('Pro or Max plan');
    expect(plan[0]?.text()).toContain('Sign in with your plan');
    expect(plan[1]?.text()).toContain('ChatGPT');
    expect(plan[2]?.text()).toContain('GitHub Copilot');
    const keyed = section.findAll('[data-test="key-tile"]');
    expect(keyed).toHaveLength(3);
    expect(keyed[0]?.text()).toContain('Anthropic');
    expect(keyed[1]?.text()).toContain('Google');
    expect(keyed[2]?.text()).toContain('xAI');
    await plan[0]?.trigger('click');
    expect(fake.navigate).toHaveBeenCalledWith('kvai.provider', { providerId: 'anthropic' });
    await plan[1]?.trigger('click');
    expect(fake.navigate).toHaveBeenCalledWith('kvai.provider', { providerId: 'openai' });
    await plan[2]?.trigger('click');
    expect(fake.navigate).toHaveBeenCalledWith('kvai.provider', { providerId: 'github-copilot' });
    await keyed[1]?.trigger('click');
    expect(fake.navigate).toHaveBeenCalledWith('kvai.provider', { providerId: 'google' });
    const own = section.find('[data-test="own-server-tile"]');
    expect(own.text()).toContain('Your own server');
    expect(own.text()).toContain('Ollama, LM Studio');
    await own.trigger('click');
    expect(fake.navigate).toHaveBeenCalledWith('kvai.provider-add');
    wrapper.unmount();
  });

  it('QA16-E2 connected or missing providers drop out, and an empty plan group hides', async () => {
    const fake = createFakeKvman();
    fake.handle('kvai.provider.list', () => [row('anthropic', 'apiKey'), row('openai'), row('github-copilot'), row('xai')]);
    fake.handle('kvai.model.default.get', () => ({ id: null, name: null, ready: false }));
    const wrapper = await mounted(ProvidersPage, fake);
    const section = wrapper.find('[data-test="connect-section"]');
    expect(section.findAll('[data-test="plan-tile"]').map((tile) => tile.text())).toEqual(
      expect.arrayContaining([expect.stringContaining('ChatGPT'), expect.stringContaining('GitHub Copilot')]),
    );
    expect(section.text()).not.toContain('Claude');
    const remaining = section.findAll('[data-test="key-tile"]');
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.text()).toContain('xAI');
    expect(section.find('[data-test="own-server-tile"]').exists()).toBe(true);
    wrapper.unmount();

    const allPlans = createFakeKvman();
    allPlans.handle('kvai.provider.list', () => [row('anthropic', 'oauth'), row('openai', 'oauth'), row('github-copilot', 'oauth'), row('xai')]);
    allPlans.handle('kvai.model.default.get', () => ({ id: null, name: null, ready: false }));
    const hidden = await mounted(ProvidersPage, allPlans);
    expect(hidden.find('[data-test="connect-section"]').findAll('[data-test="plan-tile"]')).toHaveLength(0);
    expect(hidden.find('[data-test="connect-section"]').text()).not.toContain('With your plan');
    expect(hidden.find('[data-test="own-server-tile"]').exists()).toBe(true);
    hidden.unmount();
  });

  it('featuredTiles keeps only listed, unconnected providers', () => {
    expect(featuredTiles(featured)).toEqual({
      plan: [
        { provider: 'anthropic', name: 'kvai.ui.providers.tile.claude', note: 'kvai.ui.providers.tile.claudePlan' },
        { provider: 'openai', name: 'kvai.ui.providers.tile.chatgpt', note: 'kvai.ui.providers.tile.chatgptPlan' },
        { provider: 'github-copilot', name: 'kvai.ui.providers.tile.copilot', note: 'kvai.ui.providers.tile.copilotPlan' },
      ],
      key: [
        { provider: 'anthropic', name: 'kvai.ui.providers.tile.anthropic' },
        { provider: 'google', name: 'kvai.ui.providers.tile.google' },
        { provider: 'xai', name: 'kvai.ui.providers.tile.xai' },
      ],
    });
    expect(featuredTiles([row('anthropic', 'oauth')].concat(featured.filter((entry) => entry.id !== 'anthropic')))).toEqual({
      plan: [
        { provider: 'openai', name: 'kvai.ui.providers.tile.chatgpt', note: 'kvai.ui.providers.tile.chatgptPlan' },
        { provider: 'github-copilot', name: 'kvai.ui.providers.tile.copilot', note: 'kvai.ui.providers.tile.copilotPlan' },
      ],
      key: [
        { provider: 'google', name: 'kvai.ui.providers.tile.google' },
        { provider: 'xai', name: 'kvai.ui.providers.tile.xai' },
      ],
    });
  });
});
