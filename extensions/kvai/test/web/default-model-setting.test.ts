import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ModelSetting from '../../web/src/ModelSetting.vue';
import type { ProviderRow } from '../../web/src/provider-groups.ts';
import { createFakeKvman, mounted, problemError, type FakeKvman } from './support/fake-kvman.ts';

const key = 'kvai.defaultModel';
const openai: ProviderRow = { id: 'openai', title: 'OpenAI', builtIn: true, status: 'ready', models: 2, connection: 'oauth', signIn: true, apiKey: true };
const anthropic: ProviderRow = { id: 'anthropic', title: 'Anthropic', builtIn: true, status: 'needsKey', models: 3, connection: null, signIn: true, apiKey: true };
const models = [
  { id: 'openai/gpt-6-luna', name: 'GPT-6 Luna' },
  { id: 'openai/gpt-6-nova', name: 'GPT-6 Nova' },
];

type Values = { global?: string; workspace?: string };

// kvman's settings as the kernel keeps them for the key: a value per scope, and the one in effect.
function world(values: Values = { global: 'openai/gpt-6-luna' }, options: { fail?: boolean; rows?: ProviderRow[] } = {}): FakeKvman {
  const fake = createFakeKvman();
  const current = (): string | null => values.workspace ?? values.global ?? null;
  fake.handle('kvai.provider.list', () => options.rows ?? [openai, anthropic]);
  fake.handle('kvai.model.list', () => models);
  fake.handle('kvai.model.default.get', () => ({ id: current(), name: models.find((model) => model.id === current())?.name ?? null, ready: current() !== null }));
  fake.handle('kernel.settings.list', () => [{ key, value: current(), source: values.workspace !== undefined ? 'workspace' : values.global !== undefined ? 'global' : 'default' }]);
  fake.handle('kernel.settings.set', (input) => {
    if (options.fail === true) throw problemError('kvai/PROVIDER_UNKNOWN', { provider: 'x' });
    values[input['scope'] === 'workspace' ? 'workspace' : 'global'] = String(input['value']);
    return {};
  });
  fake.handle('kernel.settings.reset', (input) => {
    delete values[input['scope'] === 'workspace' ? 'workspace' : 'global'];
    return {};
  });
  return fake;
}

type Row = Awaited<ReturnType<typeof mounted>>;
const writes = (fake: FakeKvman) => fake.calls.filter((call) => call.name === 'kernel.settings.set' || call.name === 'kernel.settings.reset');
const button = (row: Row) => row.find('[data-test="default-model-button"]');

async function open(row: Row): Promise<void> {
  await button(row).trigger('click');
  await flushPromises();
}

describe("the default model's row of kvai's configuration (07 §7.3, ADR 0015)", () => {
  it("QA22-H6 the row shows the default model, and picking one writes the setting in the page's scope, with Changed and a reset", async () => {
    const fake = world();
    const row = await mounted(ModelSetting, fake);
    expect(row.find('[data-test="default-title"]').text()).toBe('Default model');
    expect(row.find('[data-test="default-description"]').text()).toBe('The model used when a chat or an extension names none.');
    expect(button(row).text()).toBe('GPT-6 Luna');
    expect(row.find('[data-test="default-changed"]').text()).toBe('Changed');
    fake.scope.value = 'workspace';
    await flushPromises();
    expect(row.find('[data-test="default-changed"]').exists()).toBe(false);
    await open(row);
    expect(row.findAll('[data-test="picker-group"]').map((group) => group.text())).toEqual(['OpenAI']);
    expect(row.findAll('[data-test="picker-option"]').map((option) => [option.text(), option.attributes('aria-selected')])).toEqual([['GPT-6 Luna', 'true'], ['GPT-6 Nova', 'false']]);
    await row.findAll('[data-test="picker-option"]')[1]?.trigger('click');
    await flushPromises();
    expect(writes(fake)).toEqual([{ name: 'kernel.settings.set', input: { key, value: 'openai/gpt-6-nova', scope: 'workspace' } }]);
    expect(fake.toast).toHaveBeenCalledWith('kvai.ui.models.defaultSet', {}, 'success');
    expect(row.find('[data-test="model-picker"]').exists()).toBe(false);
    expect(button(row).text()).toBe('GPT-6 Nova');
    expect(row.find('[data-test="default-changed"]').text()).toBe('Changed for notes-app');
    expect(row.find('[data-test="default-reset"]').text()).toBe('Use the value for all workspaces');
    await row.find('[data-test="default-reset"]').trigger('click');
    await flushPromises();
    expect(writes(fake)[1]).toEqual({ name: 'kernel.settings.reset', input: { key, scope: 'workspace' } });
    expect(button(row).text()).toBe('GPT-6 Luna');
    row.unmount();
  });

  it('QA22-E3 a rejected change keeps the popover open with the reason, and toasts nothing', async () => {
    const fake = world({ global: 'openai/gpt-6-luna' }, { fail: true });
    const row = await mounted(ModelSetting, fake);
    await open(row);
    await row.findAll('[data-test="picker-option"]')[1]?.trigger('click');
    await flushPromises();
    expect(row.find('[data-test="picker-pick-error"]').text()).toBe("There's no provider x.");
    expect(fake.toast).not.toHaveBeenCalled();
    expect(button(row).text()).toBe('GPT-6 Luna');
    row.unmount();
  });

  it("QA22-E4 a workspace's own default can't be changed from All workspaces", async () => {
    const fake = world({ global: 'openai/gpt-6-luna', workspace: 'openai/gpt-6-nova' });
    const row = await mounted(ModelSetting, fake);
    expect(button(row).text()).toBe('GPT-6 Nova');
    expect(button(row).attributes('disabled')).toBeDefined();
    expect(row.find('[data-test="default-own-value"]').text()).toBe('notes-app has its own value. Switch to notes-app to change it.');
    expect(row.find('[data-test="default-changed"]').exists()).toBe(false);
    fake.scope.value = 'workspace';
    await flushPromises();
    expect(button(row).attributes('disabled')).toBeUndefined();
    expect(row.find('[data-test="default-own-value"]').exists()).toBe(false);
    row.unmount();
  });

  it('QA22-E5 with no default the button says "Choose a model", and with no callable provider the popover says to connect one', async () => {
    const row = await mounted(ModelSetting, world({}, { rows: [anthropic] }));
    expect(button(row).text()).toBe('Choose a model');
    expect(row.find('[data-test="default-changed"]').exists()).toBe(false);
    await open(row);
    expect(row.find('[data-test="picker-connect"]').text()).toBe('Connect a provider first.');
    expect(row.findAll('[data-test="picker-option"]')).toHaveLength(0);
    row.unmount();
  });

  it('QA22-E7 the row shows no raw key, closed or open, in English and Arabic', async () => {
    for (const language of ['en', 'ar']) {
      const fake = world({ global: 'openai/gpt-6-luna', workspace: 'openai/gpt-6-nova' });
      fake.language.value = language;
      const row = await mounted(ModelSetting, fake);
      expect(row.text(), language).not.toContain('kvai.');
      fake.scope.value = 'workspace';
      await flushPromises();
      await open(row);
      expect(row.find('[data-test="picker-count"]').exists(), language).toBe(true);
      expect(row.text(), language).not.toContain('kvai.');
      row.unmount();
    }
  });
});
