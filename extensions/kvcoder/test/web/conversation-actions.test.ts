import { flushPromises } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import ConversationView from '../../web/src/ConversationView.vue';
import { createFakeKvman } from './support/fake-kvman.ts';
import { mounted, serve, session, user } from './support/fixtures.ts';

const ok = () => ({});

describe("the conversation's actions (08 §8.7, ADR 0009, 104)", () => {
  it('M2.4-E57 send with an image, Stop, the model picker, the prompt, and the menu', async () => {
    const fake = createFakeKvman();
    const world = { found: session({ status: 'running' }), messages: [user('go')], omitted: 0, turns: [] };
    serve(fake, world);
    for (const name of ['kvcoder.message.send', 'kvcoder.turn.cancel', 'kvcoder.session.configure', 'kvcoder.session.rename', 'kvcoder.session.delete']) fake.handle(name, ok);
    fake.handle('kvcoder.session.compact', () => ({ summarized: true }));
    fake.handle('kvcoder.session.fork', () => session({ id: 's2' }));
    fake.handle('kvcoder.prompt.get', () => ({ prompt: 'You are kvman Coder', sections: [{ id: 'guide', title: 'Guide', owner: '@kvman/kvcustomizer', reach: 'global', size: 120, included: true }] }));
    const fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true, file: { id: 'f1' } })));
    vi.stubGlobal('fetch', fetch);
    const wrapper = await mounted(ConversationView, fake, { sessionId: 's1' });

    const picker = wrapper.find('[data-test="composer-files"]');
    Object.defineProperty(picker.element, 'files', { value: [new File(['png'], 'shot.png', { type: 'image/png' })] });
    await picker.trigger('change');
    await flushPromises();
    expect(fetch).toHaveBeenCalledWith('/api/files?name=shot.png&workspaceId=home', expect.objectContaining({ method: 'POST', headers: { 'content-type': 'image/png' } }));
    await wrapper.find('[data-test="composer-text"]').setValue('look at this');
    await wrapper.find('[data-test="send"]').trigger('click');
    await flushPromises();
    expect(fake.calls).toContainEqual({ name: 'kvcoder.message.send', input: { sessionId: 's1', text: 'look at this', fileIds: ['f1'] } });

    await wrapper.find('[data-test="stop"]').trigger('click');
    await flushPromises();
    expect(fake.calls.map((call) => call.name)).toContain('kvcoder.turn.cancel');

    await wrapper.find('[data-test="model-picker"]').trigger('click');
    await wrapper.find('[data-test="model-fake/m2"]').trigger('click');
    await wrapper.find('[data-test="thinking-picker"]').setValue('high');
    await flushPromises();
    expect(fake.calls.filter((call) => call.name === 'kvcoder.session.configure').map((call) => call.input)).toEqual([{ sessionId: 's1', model: 'fake/m2' }, { sessionId: 's1', thinking: 'high' }]);

    await wrapper.find('[data-test="chat-menu"]').trigger('click');
    await wrapper.find('[data-test="menu-prompt"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-test="prompt-text"]').text()).toBe('You are kvman Coder');
    expect(wrapper.find('[data-test="prompt-section"]').text()).toContain('Guide · @kvman/kvcustomizer · every workspace · 120 bytes');
    await wrapper.find('[data-test="prompt-back"]').trigger('click');

    await wrapper.find('[data-test="chat-menu"]').trigger('click');
    await wrapper.find('[data-test="menu-rename"]').trigger('click');
    await wrapper.find('[data-test="rename-input"]').setValue('Better name');
    await wrapper.find('[data-test="rename-input"]').trigger('blur');
    await flushPromises();
    expect(fake.calls).toContainEqual({ name: 'kvcoder.session.rename', input: { sessionId: 's1', title: 'Better name' } });
    for (const item of ['menu-compact', 'menu-fork']) {
      await wrapper.find('[data-test="chat-menu"]').trigger('click');
      await wrapper.find(`[data-test="${item}"]`).trigger('click');
      await flushPromises();
    }
    expect(fake.calls.map((call) => call.name)).toEqual(expect.arrayContaining(['kvcoder.session.compact', 'kvcoder.session.fork']));
    expect(fake.navigate).toHaveBeenCalledWith('kvcoder.session', { sessionId: 's2' });
    await wrapper.find('[data-test="chat-menu"]').trigger('click');
    await wrapper.find('[data-test="menu-delete"]').trigger('click');
    expect(fake.calls.map((call) => call.name)).not.toContain('kvcoder.session.delete');
    await wrapper.find('[data-test="confirm-delete"]').trigger('click');
    await flushPromises();
    expect(fake.calls).toContainEqual({ name: 'kvcoder.session.delete', input: { sessionId: 's1' } });
    expect(fake.navigate).toHaveBeenLastCalledWith('kvcoder.chat');
    vi.unstubAllGlobals();
    wrapper.unmount();
  });

  it("M2.4-E58 the Chat page's input creates a session, sends the message, and opens the session page", async () => {
    const fake = createFakeKvman();
    fake.handle('kernel.settings.list', () => [{ key: 'kvai.defaultModel', value: 'fake/m1' }]);
    fake.handle('kvai.provider.list', () => [{ id: 'fake', title: 'Fake', status: 'noKey' }]);
    fake.handle('kvai.model.list', () => [{ id: 'fake/m1', name: 'M1', provider: 'fake' }]);
    fake.handle('kvcoder.session.create', () => session({ id: 's9', title: '' }));
    fake.handle('kvcoder.message.send', ok);
    const wrapper = await mounted(ConversationView, fake);
    expect(wrapper.find('h1').text()).toBe('What should we build in notes-app?');
    await wrapper.find('[data-test="composer-text"]').setValue('Make a notes page');
    await wrapper.find('[data-test="composer-text"]').trigger('keydown', { key: 'Enter' });
    await flushPromises();
    expect(fake.calls.slice(3)).toEqual([{ name: 'kvcoder.session.create', input: {} }, { name: 'kvcoder.message.send', input: { sessionId: 's9', text: 'Make a notes page' } }]);
    expect(fake.navigate).toHaveBeenCalledWith('kvcoder.session', { sessionId: 's9' });
    wrapper.unmount();
  });
});
