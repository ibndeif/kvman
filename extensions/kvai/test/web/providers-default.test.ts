import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ProvidersPage from '../../web/src/ProvidersPage.vue';
import { createFakeKvman, mounted, problemError } from './support/fake-kvman.ts';

const openai = { id: 'openai', title: 'OpenAI', builtIn: true, status: 'ready', models: 44, connection: 'oauth', signIn: true, apiKey: true };

function serve(fake: ReturnType<typeof createFakeKvman>, rows: unknown[], current: unknown): void {
  fake.handle('kvai.provider.list', () => rows);
  fake.handle('kvai.model.default.get', () => current);
  fake.handle('kvai.model.list', () => []);
}

describe('the default-model card (07 §7.3, ADR 0009, 239)', () => {
  it('QA16-H1 the card shows the default model and its Change model button', async () => {
    const fake = createFakeKvman();
    serve(fake, [openai], { id: 'openai/gpt-6-luna', name: 'GPT-6 Luna', ready: true });
    const wrapper = await mounted(ProvidersPage, fake);
    expect(fake.calls).toContainEqual({ name: 'kvai.provider.list', input: {} });
    expect(fake.calls).toContainEqual({ name: 'kvai.model.default.get', input: {} });
    const card = wrapper.find('[data-test="default-card"]');
    expect(card.find('[data-test="avatar"]').text()).toBe('O');
    expect(card.text()).toContain('Default model');
    expect(card.text()).toContain('GPT-6 Luna');
    expect(card.find('[data-test="default-id"]').text()).toBe('openai/gpt-6-luna · Connected with your plan');
    expect(card.find('[data-test="default-chip"]').text()).toBe('Ready');
    expect(card.find('[data-test="default-chip"]').attributes('data-tone')).toBe('success');
    const button = card.find('[data-test="change-model"]');
    expect(button.text()).toBe('Change model');
    expect(button.attributes('aria-haspopup')).toBe('dialog');
    expect(button.attributes('aria-expanded')).toBe('false');
    await button.trigger('click');
    await flushPromises();
    expect(button.attributes('aria-expanded')).toBe('true');
    const picker = card.find('[data-test="model-picker"]');
    expect(picker.attributes('role')).toBe('dialog');
    expect(picker.attributes('aria-label')).toBe('Choose a model');
    expect(picker.find('[data-test="picker-search"]').attributes('placeholder')).toBe('Search models');
    wrapper.unmount();

    const notReady = createFakeKvman();
    serve(notReady, [openai], { id: 'openai/gpt-6-luna', name: 'GPT-6 Luna', ready: false });
    const second = await mounted(ProvidersPage, notReady);
    expect(second.find('[data-test="default-chip"]').text()).toBe('Not ready');
    expect(second.find('[data-test="default-chip"]').attributes('data-tone')).toBe('warning');
    second.unmount();

    const unknown = createFakeKvman();
    serve(unknown, [openai], { id: 'ghost/m1', name: 'Ghost', ready: false });
    const third = await mounted(ProvidersPage, unknown);
    const thirdCard = third.find('[data-test="default-card"]');
    expect(thirdCard.find('[data-test="avatar"]').text()).toBe('G');
    expect(thirdCard.text()).toContain('Ghost');
    expect(thirdCard.find('[data-test="default-id"]').text()).toBe('ghost/m1 · Connect it to use its models.');
    third.unmount();
  });

  it('QA16-E1 with no default model the card says so and offers Choose a model', async () => {
    const fake = createFakeKvman();
    serve(fake, [openai], { id: null, name: null, ready: false });
    const wrapper = await mounted(ProvidersPage, fake);
    const card = wrapper.find('[data-test="default-card"]');
    expect(card.find('[data-test="default-empty"]').text()).toBe('No default model yet. Connect a provider, then choose one.');
    expect(card.find('[data-test="avatar"]').exists()).toBe(false);
    expect(card.find('[data-test="change-model"]').text()).toBe('Choose a model');
    wrapper.unmount();
  });

  it('QA16-E3 a failed provider list shows its text and no sections', async () => {
    const fake = createFakeKvman();
    fake.handle('kvai.provider.list', () => {
      throw problemError('kvai/PROVIDER_UNKNOWN', { provider: 'x' });
    });
    fake.handle('kvai.model.default.get', () => ({ id: null, name: null, ready: false }));
    const wrapper = await mounted(ProvidersPage, fake);
    expect(wrapper.find('[data-test="providers-error"]').text()).toBe("There's no provider x.");
    expect(wrapper.find('[data-test="default-card"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="connected-section"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="connect-section"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="all-section"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('QA16-E7 no raw keys in any Models page state, in English and Arabic', async () => {
    const states: { rows: unknown[]; current: unknown; failing: boolean }[] = [
      { rows: [openai], current: { id: 'openai/gpt-6-luna', name: 'GPT-6 Luna', ready: true }, failing: false },
      { rows: [openai], current: { id: 'openai/gpt-6-luna', name: 'GPT-6 Luna', ready: false }, failing: false },
      { rows: [], current: { id: null, name: null, ready: false }, failing: false },
      { rows: [], current: { id: null, name: null, ready: false }, failing: true },
    ];
    for (const language of ['en', 'ar'] as const) {
      for (const state of states) {
        const fake = createFakeKvman();
        fake.language.value = language;
        if (state.failing) {
          fake.handle('kvai.provider.list', () => {
            throw problemError('kvai/PROVIDER_UNKNOWN', { provider: 'x' });
          });
          fake.handle('kvai.model.default.get', () => state.current);
        } else {
          serve(fake, state.rows, state.current);
        }
        const wrapper = await mounted(ProvidersPage, fake);
        expect(wrapper.text(), language).not.toContain('kvai.');
        wrapper.unmount();
      }
    }
  });
});
