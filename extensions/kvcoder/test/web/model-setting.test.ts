import { describe, expect, it } from 'vitest';
import { ProblemError, type Json } from '@kvman/sdk';
import SessionModel from '../../web/src/SessionModel.vue';
import ModelSetting from '../../web/src/ModelSetting.vue';
import { createFakeKvman, type FakeKvman } from './support/fake-kvman.ts';
import { mounted, session } from './support/fixtures.ts';

const key = 'kvcoder.model';
const providers = [
  { id: 'zed', title: 'Zed AI', status: 'ready' },
  { id: 'fake', title: 'Fake', status: 'noKey' },
  { id: 'locked', title: 'Locked', status: 'needsKey' },
];
const models = [
  { id: 'zed/z1', name: 'Z1', provider: 'zed' },
  { id: 'fake/m1', name: 'M1', provider: 'fake' },
  { id: 'locked/l1', name: 'L1', provider: 'locked' },
];
const luna = { id: 'openai/gpt-6-luna', name: 'GPT-6 Luna', ready: true };

type Values = { global?: Json; workspace?: Json };

// kvman's settings as the kernel keeps them for one key: a value per scope, and the one in effect.
function world(values: Values = {}, options: { fail?: boolean; defaultModel?: Json } = {}): FakeKvman {
  const fake = createFakeKvman();
  fake.handle('kvai.provider.list', () => providers);
  fake.handle('kvai.model.list', () => models);
  fake.handle('kvai.model.default.get', () => options.defaultModel ?? luna);
  fake.handle('kernel.settings.list', () => [{ key, value: 'workspace' in values ? values.workspace : (values.global ?? null), source: 'workspace' in values ? 'workspace' : 'global' in values ? 'global' : 'default' }]);
  fake.handle('kernel.settings.set', (input) => {
    if (options.fail === true) throw new ProblemError({ code: 'VALIDATION_FAILED', message: 'Not valid.' });
    values[input['scope'] === 'workspace' ? 'workspace' : 'global'] = input['value'] as Json;
    return {};
  });
  fake.handle('kernel.settings.reset', (input) => {
    delete values[input['scope'] === 'workspace' ? 'workspace' : 'global'];
    return {};
  });
  return fake;
}

const writes = (fake: FakeKvman) => fake.calls.filter((call) => call.name === 'kernel.settings.set' || call.name === 'kernel.settings.reset');
const button = (row: Awaited<ReturnType<typeof mounted>>) => row.find('[data-test="model-picker"]');
const options = (row: Awaited<ReturnType<typeof mounted>>) => row.findAll('[role="option"]').map((option) => option.text());

describe("the model row of kvcoder's configuration (08 §8.7, ADR 0015)", () => {
  it('QA22-H4 the row shows the default model, lists "Use the default model" first, and picking a model writes the setting', async () => {
    const fake = world();
    const row = await mounted(ModelSetting, fake);
    expect(row.find('[data-test="model-setting-title"]').text()).toBe('Model');
    expect(row.find('[data-test="model-setting-description"]').text()).toBe('The model a new chat starts with.');
    expect(button(row).text()).toBe('Default model (GPT-6 Luna)');
    expect(row.find('[data-test="model-changed"]').exists()).toBe(false);
    await button(row).trigger('click');
    expect(options(row)).toEqual(['Use the default model', 'M1', 'Z1']);
    expect(row.findAll('[data-test="model-group"]').map((group) => group.text())).toEqual(['Fake', 'Zed AI']);
    expect(row.find('[data-test="model-none-entry"]').attributes()).toMatchObject({ 'aria-selected': 'true', 'data-active': 'true' });
    expect(row.find('[data-test="model-count"]').text()).toBe('2 of 2 models');
    await row.find('[data-test="model-zed/z1"]').trigger('click');
    await expect.poll(() => button(row).text()).toBe('Z1');
    expect(writes(fake)).toEqual([{ name: 'kernel.settings.set', input: { key, value: 'zed/z1', scope: 'global' } }]);
    expect(row.find('[data-test="model-popover"]').exists()).toBe(false);
    expect(row.find('[data-test="model-changed"]').text()).toBe('Changed');
    expect(row.find('[data-test="model-reset"]').text()).toBe('Reset');
  });

  it('QA22-H5 "Use the default model" stores null in the page\'s scope, with Changed and a reset', async () => {
    const fake = world({ global: 'zed/z1' });
    fake.scope.value = 'workspace';
    const row = await mounted(ModelSetting, fake);
    expect(button(row).text()).toBe('Z1');
    await button(row).trigger('click');
    expect(row.find('[data-test="model-zed/z1"]').attributes('data-active')).toBe('true');
    await row.find('[data-test="model-search"]').trigger('keydown', { key: 'Up' });
    await row.find('[data-test="model-search"]').trigger('keydown', { key: 'Up' });
    expect(row.find('[data-test="model-none-entry"]').attributes('data-active')).toBe('true');
    await row.find('[data-test="model-search"]').trigger('keydown', { key: 'Enter' });
    await expect.poll(() => button(row).text()).toBe('Default model (GPT-6 Luna)');
    expect(row.find('[data-test="model-changed"]').text()).toBe('Changed for notes-app');
    expect(row.find('[data-test="model-reset"]').text()).toBe('Use the value for all workspaces');
    await row.find('[data-test="model-reset"]').trigger('click');
    await expect.poll(() => button(row).text()).toBe('Z1');
    expect(writes(fake)).toEqual([{ name: 'kernel.settings.set', input: { key, value: null, scope: 'workspace' } }, { name: 'kernel.settings.reset', input: { key, scope: 'workspace' } }]);
    expect(row.find('[data-test="model-changed"]').exists()).toBe(false);
  });

  it('QA22-E1 a search hides "Use the default model", and the chat\'s picker never has it', async () => {
    const row = await mounted(ModelSetting, world());
    await button(row).trigger('click');
    await row.find('[data-test="model-search"]').setValue('z');
    expect(options(row)).toEqual(['Z1']);
    expect(row.find('[data-test="model-zed/z1"]').attributes('data-active')).toBe('true');
    await row.find('[data-test="model-search"]').setValue('');
    expect(options(row)).toEqual(['Use the default model', 'M1', 'Z1']);

    const header = await mounted(SessionModel, world(), { session: session({ model: 'fake/m1' }) });
    await header.find('[data-test="model-picker"]').trigger('click');
    expect(options(header)).toEqual(['M1', 'Z1']);
    expect(header.find('[data-test="model-none-entry"]').exists()).toBe(false);
    header.unmount();
  });

  it("QA22-E2 a workspace's own model can't be changed from All workspaces", async () => {
    const fake = world({ workspace: 'locked/l1' });
    const row = await mounted(ModelSetting, fake);
    expect(button(row).text()).toBe('L1');
    expect(button(row).attributes('disabled')).toBeDefined();
    expect(row.find('[data-test="model-own-value"]').text()).toBe('notes-app has its own value. Switch to notes-app to change it.');
    fake.scope.value = 'workspace';
    await expect.poll(() => row.find('[data-test="model-own-value"]').exists()).toBe(false);
    expect(button(row).attributes('disabled')).toBeUndefined();
    expect(row.find('[data-test="model-changed"]').text()).toBe('Changed for notes-app');
  });

  it('QA22-E3 a rejected change toasts the Problem and keeps the label', async () => {
    const fake = world({}, { fail: true });
    const row = await mounted(ModelSetting, fake);
    await button(row).trigger('click');
    await row.find('[data-test="model-zed/z1"]').trigger('click');
    await expect.poll(() => fake.toast.mock.calls).toEqual([['kernel.errors.VALIDATION_FAILED', {}, 'error']]);
    expect(button(row).text()).toBe('Default model (GPT-6 Luna)');
    expect(button(row).attributes('disabled')).toBeUndefined();
  });

  it('QA22-E5 with no default model the button says only "Default model"', async () => {
    const row = await mounted(ModelSetting, world({}, { defaultModel: { id: null, name: null, ready: false } }));
    expect(button(row).text()).toBe('Default model');
  });

  it('QA22-E7 the row shows no raw key, closed or open, in English and Arabic', async () => {
    for (const language of ['en', 'ar']) {
      const fake = world({ workspace: 'zed/z1' });
      fake.language.value = language;
      const row = await mounted(ModelSetting, fake);
      expect(row.text(), language).not.toContain('kvcoder.');
      fake.scope.value = 'workspace';
      await expect.poll(() => row.find('[data-test="model-changed"]').exists()).toBe(true);
      await button(row).trigger('click');
      expect(row.text(), language).not.toContain('kvcoder.');
      row.unmount();
    }
  });
});
