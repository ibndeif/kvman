import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ProviderModels from '../../web/src/ProviderModels.vue';
import { createFakeKvman, mounted, problemError, type FakeKvman } from './support/fake-kvman.ts';

type Model = {
  id: string;
  name: string;
  provider: string;
  reasoning: boolean;
  input: string[];
  contextWindow: number;
  maxTokens: number;
  cost: number;
  builtIn: boolean;
  isDefault: boolean;
};

function model(index: number, overrides: Partial<Model> = {}): Model {
  return {
    id: `openai/model-${index}`,
    name: `Model ${String(index).padStart(2, '0')}`,
    provider: 'openai',
    reasoning: index % 3 === 0,
    input: ['text'],
    contextWindow: 1_000_000,
    maxTokens: 8000,
    cost: 1,
    builtIn: true,
    isDefault: false,
    ...overrides,
  };
}

const luna = model(1, { id: 'openai/luna-prime', name: 'Luna Prime', reasoning: true, isDefault: true });
const rows = [luna, ...Array.from({ length: 59 }, (_, index) => model(index + 2))];

function serve(fake: FakeKvman, models: Model[]): void {
  fake.handle('kvai.model.list', () => models);
  fake.handle('kernel.settings.set', () => ({}));
}

describe("the provider's models (07 §7.3, ADR 0009, 247)", () => {
  it('QA16-H12 the provider models list, its paging, and Make default', async () => {
    const fake = createFakeKvman();
    serve(fake, rows);
    const wrapper = await mounted(ProviderModels, fake, { providerId: 'openai' });
    expect(fake.calls).toContainEqual({ name: 'kvai.model.list', input: { provider: 'openai' } });
    expect(wrapper.find('[data-test="models-title"]').text()).toContain('Models');
    expect(wrapper.find('[data-test="models-count"]').text()).toBe('60');

    const shown = wrapper.findAll('[data-test="model-row"]');
    expect(shown).toHaveLength(25);
    expect(shown[0]?.text()).toContain('Luna Prime');
    expect(shown[1]?.text()).toContain('Model 02');
    const first = shown[0];
    expect(first?.find('[data-test="model-id"]').text()).toBe('openai/luna-prime');
    expect(first?.find('[data-test="model-thinking"]').text()).toBe('Thinking');
    expect(first?.find('[data-test="model-context"]').text()).toBe('1,000,000');
    expect(first?.attributes('data-default')).toBe('true');
    expect(first?.find('[data-test="model-default"]').text()).toBe('Default');
    expect(first?.find('[data-test="make-default"]').exists()).toBe(false);
    const second = shown[1];
    expect(second?.attributes('data-default')).toBe('false');
    expect(second?.find('[data-test="make-default"]').text()).toBe('Make default');

    await wrapper.find('[data-test="models-more"]').trigger('click');
    expect(wrapper.findAll('[data-test="model-row"]')).toHaveLength(50);
    await wrapper.find('[data-test="models-more"]').trigger('click');
    expect(wrapper.findAll('[data-test="model-row"]')).toHaveLength(60);
    expect(wrapper.find('[data-test="models-more"]').exists()).toBe(false);

    await wrapper.find('[data-test="models-search"]').setValue('luna');
    expect(wrapper.findAll('[data-test="model-row"]')).toHaveLength(1);
    await wrapper.find('[data-test="models-search"]').setValue('zzz');
    expect(wrapper.findAll('[data-test="model-row"]')).toHaveLength(0);
    expect(wrapper.find('[data-test="models-no-match"]').text()).toBe('No model matches.');
    expect(wrapper.find('[data-test="models-no-match"]').attributes('role')).toBe('status');
    wrapper.unmount();

    const picking = createFakeKvman();
    serve(picking, rows);
    const page = await mounted(ProviderModels, picking, { providerId: 'openai' });
    await page.findAll('[data-test="make-default"]')[0]?.trigger('click');
    await flushPromises();
    expect(picking.calls).toContainEqual({
      name: 'kernel.settings.set',
      input: { key: 'kvai.defaultModel', value: 'openai/model-2', scope: 'global' },
    });
    expect(picking.toast).toHaveBeenCalledWith('kvai.ui.models.defaultSet', {}, 'success');
    expect(picking.refresh).toHaveBeenCalled();
    expect(picking.calls.filter((call) => call.name === 'kvai.model.list')).toHaveLength(2);
    page.unmount();

    const failing = createFakeKvman();
    serve(failing, rows);
    failing.handle('kernel.settings.set', () => {
      throw problemError('kvai/PROVIDER_UNKNOWN', { provider: 'openai' });
    });
    const failed = await mounted(ProviderModels, failing, { providerId: 'openai' });
    await failed.findAll('[data-test="make-default"]')[0]?.trigger('click');
    await flushPromises();
    expect(failed.find('[data-test="models-error"]').text()).toBe("There's no provider openai.");
    expect(failed.findAll('[data-test="model-row"]')).toHaveLength(25);
    expect(failing.toast).not.toHaveBeenCalled();
    failed.unmount();
  });

  it('QA16-E5 the models search ignores case and surrounding spaces', async () => {
    const fake = createFakeKvman();
    serve(fake, rows);
    const wrapper = await mounted(ProviderModels, fake, { providerId: 'openai' });
    await wrapper.find('[data-test="models-search"]').setValue('  LUNA ');
    const found = wrapper.findAll('[data-test="model-row"]');
    expect(found).toHaveLength(1);
    expect(found[0]?.text()).toContain('Luna Prime');
    await wrapper.find('[data-test="models-search"]').setValue('OPENAI/MODEL-1');
    expect(wrapper.findAll('[data-test="model-row"]').length).toBeGreaterThan(1);
    wrapper.unmount();
  });

  it('QA16-E1 no match says so, and no models says the list is empty', async () => {
    const fake = createFakeKvman();
    serve(fake, rows);
    const wrapper = await mounted(ProviderModels, fake, { providerId: 'openai' });
    await wrapper.find('[data-test="models-search"]').setValue('zzz');
    expect(wrapper.find('[data-test="models-no-match"]').text()).toBe('No model matches.');
    wrapper.unmount();

    const empty = createFakeKvman();
    serve(empty, []);
    const none = await mounted(ProviderModels, empty, { providerId: 'openai' });
    expect(none.find('[data-test="models-empty"]').text()).toBe('No models.');
    expect(none.findAll('[data-test="model-row"]')).toHaveLength(0);
    expect(none.find('[data-test="models-more"]').exists()).toBe(false);
    none.unmount();
  });
});
