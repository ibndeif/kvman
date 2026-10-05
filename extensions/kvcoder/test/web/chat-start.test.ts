import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ChatStart from '../../web/src/ChatStart.vue';
import { createFakeKvman, type FakeKvman } from './support/fake-kvman.ts';
import { mounted } from './support/fixtures.ts';

type Settings = { model: string | null; defaultModel: string | null; thinking?: string };

const providers = [
  { id: 'zed', title: 'Zed AI', status: 'ready' },
  { id: 'fake', title: 'Fake', status: 'ready' },
  { id: 'locked', title: 'Locked', status: 'needsKey' },
];
const models = [
  { id: 'zed/z1', name: 'Z1', provider: 'zed' },
  { id: 'fake/m1', name: 'M1', provider: 'fake' },
  { id: 'locked/l1', name: 'L1', provider: 'locked' },
  { id: 'locked/l2', name: 'L2', provider: 'locked' },
];

function startFake(settings: Settings): FakeKvman {
  const fake = createFakeKvman();
  let defaultModel: string | null = settings.defaultModel;
  fake.handle('kernel.settings.list', () => [
    { key: 'kvcoder.model', value: settings.model },
    { key: 'kvai.defaultModel', value: defaultModel },
    { key: 'kvcoder.thinking', value: settings.thinking ?? 'medium' },
  ]);
  fake.handle('kernel.settings.set', (input) => {
    if (input['key'] === 'kvai.defaultModel') defaultModel = typeof input['value'] === 'string' ? input['value'] : null;
    return {};
  });
  fake.handle('kvai.provider.list', () => providers);
  fake.handle('kvai.model.list', () => models);
  fake.handle('kvcoder.session.create', () => ({ id: 's9' }));
  fake.handle('kvcoder.session.configure', () => ({}));
  fake.handle('kvcoder.message.send', () => ({}));
  return fake;
}

async function send(wrapper: Awaited<ReturnType<typeof mounted>>, text: string): Promise<void> {
  await wrapper.find('[data-test="composer-text"]').setValue(text);
  await wrapper.find('[data-test="composer-text"]').trigger('keydown', { key: 'Enter' });
  await flushPromises();
}

const thinkingOf = (wrapper: Awaited<ReturnType<typeof mounted>>): string => (wrapper.find('[data-test="thinking-picker"]').element as HTMLSelectElement).value;

describe("the Chat page's new chat (08 §8.7, ADR 0009, 194)", () => {
  it('QA9-H2 the header shows the model a new chat would use, and the thinking level', async () => {
    const first = await mounted(ChatStart, startFake({ model: null, defaultModel: 'fake/m1' }));
    expect(first.find('[data-test="model-picker"]').text()).toBe('M1');
    expect(thinkingOf(first)).toBe('medium');
    first.unmount();

    const high = await mounted(ChatStart, startFake({ model: null, defaultModel: 'fake/m1', thinking: 'high' }));
    expect(thinkingOf(high)).toBe('high');
    high.unmount();

    const picked = await mounted(ChatStart, startFake({ model: 'zed/z1', defaultModel: 'fake/m1' }));
    expect(picked.find('[data-test="model-picker"]').text()).toBe('Z1');
    picked.unmount();
  });

  it('QA9-H3 a picked model and thinking level are set before the first message', async () => {
    const fake = startFake({ model: null, defaultModel: 'fake/m1' });
    const wrapper = await mounted(ChatStart, fake);
    await wrapper.find('[data-test="model-picker"]').trigger('click');
    await wrapper.find('[data-test="model-zed/z1"]').trigger('click');
    await wrapper.find('[data-test="thinking-picker"]').setValue('low');
    await send(wrapper, 'Build it');
    expect(fake.calls).toEqual([
      { name: 'kernel.settings.list', input: {} },
      { name: 'kvai.provider.list', input: {} },
      { name: 'kvai.model.list', input: {} },
      { name: 'kernel.settings.set', input: { key: 'kvai.defaultModel', value: 'zed/z1', scope: 'global' } },
      { name: 'kvcoder.session.create', input: {} },
      { name: 'kvcoder.session.configure', input: { sessionId: 's9', model: 'zed/z1', thinking: 'low' } },
      { name: 'kvcoder.message.send', input: { sessionId: 's9', text: 'Build it' } },
    ]);
    expect(fake.navigate).toHaveBeenCalledWith('kvcoder.session', { sessionId: 's9' });
    wrapper.unmount();

    const modelOnly = startFake({ model: null, defaultModel: 'fake/m1' });
    const second = await mounted(ChatStart, modelOnly);
    await second.find('[data-test="model-picker"]').trigger('click');
    await second.find('[data-test="model-zed/z1"]').trigger('click');
    await send(second, 'Build it');
    expect(modelOnly.calls.filter((call) => call.name === 'kvcoder.session.configure')).toEqual([{ name: 'kvcoder.session.configure', input: { sessionId: 's9', model: 'zed/z1' } }]);
    second.unmount();
  });

  it('QA10-H7 picking a model remembers it at once, before any send', async () => {
    const fake = startFake({ model: null, defaultModel: 'fake/m1' });
    const wrapper = await mounted(ChatStart, fake);
    await wrapper.find('[data-test="model-picker"]').trigger('click');
    await wrapper.find('[data-test="model-zed/z1"]').trigger('click');
    await flushPromises();
    expect(fake.calls).toContainEqual({ name: 'kernel.settings.set', input: { key: 'kvai.defaultModel', value: 'zed/z1', scope: 'global' } });
    expect(fake.calls.map((call) => call.name)).not.toContain('kvcoder.session.create');
    expect(fake.calls.map((call) => call.name)).not.toContain('kvcoder.message.send');
    expect(wrapper.find('[data-test="model-picker"]').text()).toBe('Z1');
    wrapper.unmount();
  });

  it('QA9-H4 sending without picking anything configures nothing', async () => {
    const fake = startFake({ model: null, defaultModel: 'fake/m1' });
    const wrapper = await mounted(ChatStart, fake);
    await send(wrapper, 'Build it');
    expect(fake.calls.map((call) => call.name)).toEqual(['kernel.settings.list', 'kvai.provider.list', 'kvai.model.list', 'kvcoder.session.create', 'kvcoder.message.send']);
    expect(fake.navigate).toHaveBeenCalledWith('kvcoder.session', { sessionId: 's9' });
    wrapper.unmount();
  });

  it('QA9-H5 a model with no key is said, linked, and not sendable until another is picked', async () => {
    const fake = startFake({ model: null, defaultModel: 'locked/l1' });
    const wrapper = await mounted(ChatStart, fake);
    expect(wrapper.find('[data-test="key-needed"]').text()).toContain('Locked needs an API key.');
    expect(wrapper.find('[data-test="add-key"]').text()).toBe('Add a key');
    await wrapper.find('[data-test="add-key"]').trigger('click');
    expect(fake.navigate).toHaveBeenCalledWith('kvai.provider', { providerId: 'locked' });
    await send(wrapper, 'Build it');
    expect(fake.calls.map((call) => call.name)).not.toContain('kvcoder.session.create');

    await wrapper.find('[data-test="model-picker"]').trigger('click');
    await wrapper.find('[data-test="model-fake/m1"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-test="key-needed"]').exists()).toBe(false);
    await send(wrapper, 'Build it');
    expect(fake.calls.map((call) => call.name)).toContain('kvcoder.session.create');
    wrapper.unmount();
  });

  it('QA9-H6 with no model at all the picker asks for one and sending waits for the pick', async () => {
    const fake = startFake({ model: null, defaultModel: null });
    const wrapper = await mounted(ChatStart, fake);
    expect(wrapper.find('[data-test="model-picker"]').text()).toBe('Choose a model');
    expect(wrapper.find('[data-test="choose-model"]').text()).toBe('Choose a model to start.');
    await send(wrapper, 'Build it');
    expect(fake.calls.map((call) => call.name)).not.toContain('kvcoder.session.create');

    await wrapper.find('[data-test="model-picker"]').trigger('click');
    await wrapper.find('[data-test="model-fake/m1"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-test="choose-model"]').exists()).toBe(false);
    await send(wrapper, 'Build it');
    expect(fake.calls.map((call) => call.name)).toContain('kvcoder.session.create');
    wrapper.unmount();
  });

  it('QA9-H19 and QA24-E10 a new chat is the question and the send box, which holds the model and thinking pickers, with no header', async () => {
    const wrapper = await mounted(ChatStart, startFake({ model: null, defaultModel: 'fake/m1' }));
    const box = wrapper.find('.kvc-composer');
    expect(box.find('[data-test="model-picker"]').exists()).toBe(true);
    expect(box.find('[data-test="thinking-picker"]').exists()).toBe(true);
    for (const missing of ['start-header', 'chat-menu', 'running', 'session-totals']) expect(wrapper.find(`[data-test="${missing}"]`).exists()).toBe(false);
    expect(wrapper.find('header').exists()).toBe(false);
    expect(wrapper.find('h1').text()).toBe('What should we build in notes-app?');
    expect(wrapper.find('[data-test="composer-text"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="send"]').exists()).toBe(true);
    const html = wrapper.html();
    expect(html.indexOf('data-test="chat-start"')).toBeLessThan(html.indexOf('data-test="composer-text"'));
    expect(html.indexOf('data-test="composer-text"')).toBeLessThan(html.indexOf('data-test="model-picker"'));
    wrapper.unmount();
  });

  it("QA9-E2 the picker's groups hold ready providers' models and the shown model only", async () => {
    const fake = createFakeKvman();
    fake.handle('kernel.settings.list', () => [{ key: 'kvai.defaultModel', value: 'locked/l1' }]);
    fake.handle('kvai.provider.list', () => [{ id: 'zed', title: 'Zed AI', status: 'ready' }, { id: 'fake', title: 'Fake', status: 'noKey' }, { id: 'locked', title: 'Locked', status: 'needsKey' }]);
    fake.handle('kvai.model.list', () => models);
    const wrapper = await mounted(ChatStart, fake);
    await wrapper.find('[data-test="model-picker"]').trigger('click');
    expect(wrapper.findAll('[data-test="model-group"]').map((group) => group.text())).toEqual(['Fake', 'Locked', 'Zed AI']);
    expect(wrapper.findAll('[role="option"]').map((option) => option.text())).toEqual(['M1', 'L1', 'Z1']);
    wrapper.unmount();
  });

  it("QA9-E3 a failed load toasts and leaves sending on, while loading keeps it off", async () => {
    const loading = createFakeKvman();
    for (const name of ['kernel.settings.list', 'kvai.provider.list', 'kvai.model.list']) loading.handle(name, () => new Promise<never>(() => {}));
    const waiting = mount(ChatStart, { global: { provide: { kvman: loading.kvman } } });
    await waiting.find('[data-test="composer-text"]').setValue('Build it');
    expect(waiting.find('[data-test="send"]').attributes('disabled')).toBeDefined();
    waiting.unmount();

    const fake = createFakeKvman();
    fake.handle('kernel.settings.list', () => []);
    fake.handle('kvai.provider.list', () => Promise.reject(Object.assign(new Error('Gone.'), { problem: { code: 'NOT_FOUND', message: 'Gone.', params: {} } })));
    fake.handle('kvai.model.list', () => []);
    fake.handle('kvcoder.session.create', () => ({ id: 's9' }));
    fake.handle('kvcoder.message.send', () => ({}));
    const wrapper = await mounted(ChatStart, fake);
    expect(fake.toast).toHaveBeenCalledWith('kernel.errors.NOT_FOUND', {}, 'error');
    await send(wrapper, 'Build it');
    expect(fake.calls.map((call) => call.name)).toContain('kvcoder.session.create');
    wrapper.unmount();
  });

  it('QA9-E4 a failed configure toasts and stops the send', async () => {
    const fake = startFake({ model: null, defaultModel: 'fake/m1' });
    fake.handle('kvcoder.session.configure', () => Promise.reject(Object.assign(new Error('Busy.'), { problem: { code: 'kvcoder/SESSION_BUSY', message: 'Busy.', params: {} } })));
    const wrapper = await mounted(ChatStart, fake);
    await wrapper.find('[data-test="model-picker"]').trigger('click');
    await wrapper.find('[data-test="model-zed/z1"]').trigger('click');
    await send(wrapper, 'Build it');
    expect(fake.toast).toHaveBeenCalledWith('kvcoder.errors.SESSION_BUSY', {}, 'error');
    expect(fake.calls.map((call) => call.name)).not.toContain('kvcoder.message.send');
    expect(fake.navigate).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('QA9-E5 the pick becomes the default: the next visit shows the picked model, and the thinking level starts from the settings again', async () => {
    const fake = startFake({ model: null, defaultModel: 'fake/m1' });
    const first = await mounted(ChatStart, fake);
    await first.find('[data-test="model-picker"]').trigger('click');
    await first.find('[data-test="model-zed/z1"]').trigger('click');
    await first.find('[data-test="thinking-picker"]').setValue('low');
    await send(first, 'Build it');
    expect(fake.calls.map((call) => call.name)).toContain('kvcoder.session.create');
    first.unmount();

    const second = await mounted(ChatStart, fake);
    expect(second.find('[data-test="model-picker"]').text()).toBe('Z1');
    expect(thinkingOf(second)).toBe('medium');
    second.unmount();
  });
});
