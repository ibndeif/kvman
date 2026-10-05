import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ProvidersPage from '../../web/src/ProvidersPage.vue';
import { callableRows, groupByProvider, matchModels, type PickerModel } from '../../web/src/picker-models.ts';
import type { ProviderRow } from '../../web/src/provider-groups.ts';
import { createFakeKvman, mounted, problemError, type FakeKvman } from './support/fake-kvman.ts';

const openai: ProviderRow = { id: 'openai', title: 'OpenAI', builtIn: true, status: 'ready', models: 2, connection: 'oauth', signIn: true, apiKey: true };
const relay: ProviderRow = { id: 'relay', title: 'Relay', builtIn: false, status: 'noKey', models: 1, connection: null, signIn: false, apiKey: false };
const anthropic: ProviderRow = { id: 'anthropic', title: 'Anthropic', builtIn: true, status: 'needsKey', models: 3, connection: null, signIn: true, apiKey: true };

const model = (id: string, name: string, provider: string): PickerModel => ({ id, name, provider });

const luna = model('openai/gpt-6-luna', 'GPT-6 Luna', 'openai');
const nova = model('openai/gpt-6-nova', 'GPT-6 Nova', 'openai');
const one = model('relay/r1', 'Relay One', 'relay');
const current = { id: 'openai/gpt-6-luna', name: 'GPT-6 Luna', ready: true };

function serve(fake: FakeKvman, rows: ProviderRow[], models: Record<string, PickerModel[]>): void {
  fake.handle('kvai.provider.list', () => rows);
  fake.handle('kvai.model.default.get', () => current);
  fake.handle('kvai.model.list', (input) => {
    const list = models[String(input['provider'])];
    if (list === undefined) throw new Error(`No fake models for ${String(input['provider'])}.`);
    return list;
  });
  fake.handle('kernel.settings.set', () => ({}));
}

async function pressChange(wrapper: Awaited<ReturnType<typeof mounted>>): Promise<void> {
  await wrapper.find('[data-test="change-model"]').trigger('click');
  await flushPromises();
}

describe('the Change model picker (07 §7.3, ADR 0009, 244; ADR 0015, 2)', () => {
  it('QA16-H7 the picker lists callable providers and picking sets the default', async () => {
    const fake = createFakeKvman();
    serve(fake, [openai, relay, anthropic], { openai: [luna, nova], relay: [one] });
    const wrapper = await mounted(ProvidersPage, fake);
    await pressChange(wrapper);
    expect(fake.calls.filter((call) => call.name === 'kvai.model.list')).toEqual([
      { name: 'kvai.model.list', input: { provider: 'openai' } },
      { name: 'kvai.model.list', input: { provider: 'relay' } },
    ]);
    const picker = wrapper.find('[data-test="model-picker"]');
    expect(picker.findAll('[data-test="picker-group"]').map((group) => group.text())).toEqual(['OpenAI', 'Relay']);
    expect(picker.findAll('[data-test="picker-option"]')).toHaveLength(3);
    expect(picker.text()).not.toContain('Anthropic');
    await picker.find('[data-test="picker-search"]').setValue('nova');
    const options = picker.findAll('[data-test="picker-option"]');
    expect(options).toHaveLength(1);
    expect(options[0]?.text()).toContain('GPT-6 Nova');
    await options[0]?.trigger('click');
    await flushPromises();
    expect(fake.calls).toContainEqual({
      name: 'kernel.settings.set',
      input: { key: 'kvai.defaultModel', value: 'openai/gpt-6-nova', scope: 'global' },
    });
    expect(fake.toast).toHaveBeenCalledWith('kvai.ui.models.defaultSet', {}, 'success');
    expect(wrapper.find('[data-test="model-picker"]').exists()).toBe(false);
    expect(fake.calls.filter((call) => call.name === 'kvai.provider.list')).toHaveLength(2);
    wrapper.unmount();

    expect(callableRows([anthropic, relay, openai]).map((row) => row.id)).toEqual(['openai', 'relay']);
    expect(matchModels([luna, nova, one], '  LUNA ').map((found) => found.id)).toEqual(['openai/gpt-6-luna']);
    expect(groupByProvider([luna, nova, one], new Map([['openai', 'OpenAI'], ['relay', 'Relay']])).map((group) => group.title)).toEqual([
      'OpenAI',
      'Relay',
    ]);
  });

  it('QA16-H8 the picker works from the keyboard and closes', async () => {
    const fake = createFakeKvman();
    serve(fake, [openai, relay, anthropic], { openai: [luna, nova], relay: [one] });
    const wrapper = await mounted(ProvidersPage, fake);
    await pressChange(wrapper);
    const search = wrapper.find('[data-test="picker-search"]');
    expect(document.activeElement).toBe(search.element);
    const options = (): ReturnType<typeof wrapper.findAll> => wrapper.findAll('[data-test="picker-option"]');
    expect(options()[0]?.attributes('data-active')).toBe('true');
    await search.trigger('keydown', { key: 'Down' });
    expect(options()[1]?.attributes('data-active')).toBe('true');
    await search.trigger('keydown', { key: 'Down' });
    expect(options()[2]?.attributes('data-active')).toBe('true');
    await search.trigger('keydown', { key: 'Up' });
    expect(options()[1]?.attributes('data-active')).toBe('true');
    await search.trigger('keydown', { key: 'Enter' });
    await flushPromises();
    expect(fake.calls).toContainEqual({
      name: 'kernel.settings.set',
      input: { key: 'kvai.defaultModel', value: 'openai/gpt-6-nova', scope: 'global' },
    });
    expect(wrapper.find('[data-test="model-picker"]').exists()).toBe(false);
    await pressChange(wrapper);
    const callsBefore = fake.calls.length;
    await wrapper.find('[data-test="picker-search"]').trigger('keydown', { key: 'Esc' });
    expect(wrapper.find('[data-test="model-picker"]').exists()).toBe(false);
    expect(fake.calls.length).toBe(callsBefore);
    expect(document.activeElement).toBe(wrapper.find('[data-test="change-model"]').element);
    await pressChange(wrapper);
    expect(wrapper.find('[data-test="model-picker"]').exists()).toBe(true);
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await flushPromises();
    expect(wrapper.find('[data-test="model-picker"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('QA16-E1 the picker says to connect first and when nothing matches', async () => {
    const empty = createFakeKvman();
    empty.handle('kvai.provider.list', () => [anthropic]);
    empty.handle('kvai.model.default.get', () => ({ id: null, name: null, ready: false }));
    const first = await mounted(ProvidersPage, empty);
    expect(first.find('[data-test="change-model"]').text()).toBe('Choose a model');
    await pressChange(first);
    expect(first.find('[data-test="model-picker"]').text()).toContain('Connect a provider first.');
    expect(first.findAll('[data-test="picker-option"]')).toHaveLength(0);
    first.unmount();

    const fake = createFakeKvman();
    serve(fake, [openai, relay], { openai: [luna, nova], relay: [one] });
    const wrapper = await mounted(ProvidersPage, fake);
    await pressChange(wrapper);
    await wrapper.find('[data-test="picker-search"]').setValue('zzz');
    expect(wrapper.findAll('[data-test="picker-option"]')).toHaveLength(0);
    expect(wrapper.find('[data-test="picker-none"]').text()).toBe('No models match');
    expect(wrapper.find('[data-test="picker-count"]').text()).toBe('0 of 3 models');
    wrapper.unmount();
  });

  it('QA16-E3 a failed pick stays open and a failed provider still lists the others', async () => {
    const fake = createFakeKvman();
    serve(fake, [openai, relay], { openai: [luna, nova], relay: [one] });
    fake.handle('kernel.settings.set', () => {
      throw problemError('kvai/PROVIDER_UNKNOWN', { provider: 'x' });
    });
    const wrapper = await mounted(ProvidersPage, fake);
    await pressChange(wrapper);
    await wrapper.findAll('[data-test="picker-option"]')[0]?.trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-test="model-picker"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="picker-pick-error"]').text()).toBe("There's no provider x.");
    expect(fake.toast).not.toHaveBeenCalled();
    wrapper.unmount();

    const second = createFakeKvman();
    serve(second, [openai, relay], { openai: [luna, nova], relay: [one] });
    second.handle('kvai.model.list', (input) => {
      if (String(input['provider']) === 'relay') throw problemError('kvai/PROVIDER_UNKNOWN', { provider: 'relay' });
      return [luna, nova];
    });
    const other = await mounted(ProvidersPage, second);
    await pressChange(other);
    const picker = other.find('[data-test="model-picker"]');
    expect(picker.find('[data-test="picker-error"]').text()).toBe("There's no provider relay.");
    expect(picker.findAll('[data-test="picker-option"]')).toHaveLength(2);
    expect(picker.findAll('[data-test="picker-group"]').map((group) => group.text())).toEqual(['OpenAI']);
    other.unmount();
  });

  it('QA22-H7 the picker behaves like the chat\'s: the current model checked and highlighted, every word searched, a count, and arrows that wrap', async () => {
    const fake = createFakeKvman();
    serve(fake, [openai, relay, anthropic], { openai: [luna, nova], relay: [one] });
    fake.handle('kvai.model.default.get', () => ({ id: 'openai/gpt-6-nova', name: 'GPT-6 Nova', ready: true }));
    const wrapper = await mounted(ProvidersPage, fake);
    await pressChange(wrapper);
    const search = wrapper.find('[data-test="picker-search"]');
    const options = (): ReturnType<typeof wrapper.findAll> => wrapper.findAll('[data-test="picker-option"]');
    const marks = (name: string): (string | undefined)[] => options().map((option) => option.attributes(name));
    expect(search.attributes('role')).toBe('combobox');
    expect(options().map((option) => option.text())).toEqual(['GPT-6 Luna', 'GPT-6 Nova', 'Relay One']);
    expect(marks('aria-selected')).toEqual(['false', 'true', 'false']);
    expect(marks('data-active')).toEqual(['false', 'true', 'false']);
    expect(options().map((option) => option.find('svg').exists())).toEqual([false, true, false]);
    expect(wrapper.find('[data-test="picker-count"]').text()).toBe('3 of 3 models');
    await search.trigger('keydown', { key: 'Down' });
    await search.trigger('keydown', { key: 'Down' });
    expect(marks('data-active')).toEqual(['true', 'false', 'false']);
    await search.trigger('keydown', { key: 'Up' });
    expect(marks('data-active')).toEqual(['false', 'false', 'true']);
    await search.setValue('6 nova');
    expect(options().map((option) => option.text())).toEqual(['GPT-6 Nova']);
    expect(marks('data-active')).toEqual(['true']);
    expect(wrapper.find('[data-test="picker-count"]').text()).toBe('1 of 3 models');
    await search.setValue('nova 7');
    expect(options()).toHaveLength(0);
    await search.setValue('RELAY r1');
    await search.trigger('keydown', { key: 'Enter' });
    await flushPromises();
    expect(fake.calls).toContainEqual({ name: 'kernel.settings.set', input: { key: 'kvai.defaultModel', value: 'relay/r1', scope: 'global' } });
    wrapper.unmount();
  });

  it('QA22-E6 the picker has no cap: every model shows, with the count and no hint to narrow', async () => {
    const many = Array.from({ length: 150 }, (_, index) => model(`openai/m${index}`, `Model ${index}`, 'openai'));
    const fake = createFakeKvman();
    serve(fake, [openai], { openai: many });
    const wrapper = await mounted(ProvidersPage, fake);
    await pressChange(wrapper);
    const picker = wrapper.find('[data-test="model-picker"]');
    expect(picker.findAll('[data-test="picker-option"]')).toHaveLength(150);
    expect(picker.find('[data-test="picker-count"]').text()).toBe('150 of 150 models');
    expect(picker.find('[data-test="picker-narrow"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('QA16-E5 the picker search ignores case and surrounding spaces', async () => {
    const fake = createFakeKvman();
    serve(fake, [openai, relay], { openai: [luna, nova], relay: [one] });
    const wrapper = await mounted(ProvidersPage, fake);
    await pressChange(wrapper);
    await wrapper.find('[data-test="picker-search"]').setValue('  LUNA ');
    const options = wrapper.findAll('[data-test="picker-option"]');
    expect(options).toHaveLength(1);
    expect(options[0]?.text()).toContain('GPT-6 Luna');
    expect(options[0]?.attributes('data-active')).toBe('true');
    wrapper.unmount();

    expect(matchModels([luna, nova], '  NOVA ').map((found) => found.id)).toEqual(['openai/gpt-6-nova']);
  });

  it('QA16-E7 no raw keys in any picker state, in English and Arabic', async () => {
    for (const language of ['en', 'ar'] as const) {
      const fake = createFakeKvman();
      fake.language.value = language;
      serve(fake, [openai, relay], { openai: [luna, nova], relay: [one] });
      const wrapper = await mounted(ProvidersPage, fake);
      await pressChange(wrapper);
      expect(wrapper.find('[data-test="model-picker"]').text(), language).not.toContain('kvai.');
      await wrapper.find('[data-test="picker-search"]').setValue('zzz');
      expect(wrapper.find('[data-test="model-picker"]').text(), language).not.toContain('kvai.');
      wrapper.unmount();

      const empty = createFakeKvman();
      empty.language.value = language;
      empty.handle('kvai.provider.list', () => [anthropic]);
      empty.handle('kvai.model.default.get', () => ({ id: null, name: null, ready: false }));
      const second = await mounted(ProvidersPage, empty);
      await pressChange(second);
      expect(second.find('[data-test="model-picker"]').text(), language).not.toContain('kvai.');
      second.unmount();

      const failing = createFakeKvman();
      failing.language.value = language;
      serve(failing, [openai, relay], { openai: [luna, nova], relay: [one] });
      failing.handle('kvai.model.list', (input) => {
        if (String(input['provider']) === 'relay') throw problemError('kvai/PROVIDER_UNKNOWN', { provider: 'relay' });
        return [luna, nova];
      });
      failing.handle('kernel.settings.set', () => {
        throw problemError('kvai/PROVIDER_UNKNOWN', { provider: 'x' });
      });
      const third = await mounted(ProvidersPage, failing);
      await pressChange(third);
      await third.findAll('[data-test="picker-option"]')[0]?.trigger('click');
      await flushPromises();
      expect(third.find('[data-test="model-picker"]').text(), language).not.toContain('kvai.');
      third.unmount();
    }
  });
});
