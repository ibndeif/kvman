import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ConversationView from '../../web/src/ConversationView.vue';
import { createFakeKvman, type FakeKvman } from './support/fake-kvman.ts';
import { mounted, serve, session, turn, user } from './support/fixtures.ts';

type Wrapper = Awaited<ReturnType<typeof mounted>>;
const offline = () => Object.assign(new Error('offline'), { problem: { code: 'kvwebui/OFFLINE', message: 'offline', params: {} } });
const gone = () => Object.assign(new Error('gone'), { problem: { code: 'kvcoder/SESSION_NOT_FOUND', message: 'gone', params: {} } });
const box = (view: Wrapper) => view.find<HTMLTextAreaElement>('[data-test="composer-text"]');
const sends = (fake: FakeKvman) => fake.calls.filter((call) => call.name === 'kvcoder.message.send').map((call) => call.input);

function chat(workspaceId: string, sessionId = 's1'): FakeKvman {
  const fake = createFakeKvman();
  fake.workspace.value = { ...fake.workspace.value, id: workspaceId };
  serve(fake, { found: session({ id: sessionId }), messages: [user('go')], omitted: 0, turns: [turn({ sessionId })] });
  return fake;
}
function start(workspaceId: string): FakeKvman {
  const fake = createFakeKvman();
  fake.workspace.value = { ...fake.workspace.value, id: workspaceId };
  fake.handle('kernel.settings.list', () => [{ key: 'kvai.defaultModel', value: 'fake/m1' }]);
  fake.handle('kvai.provider.list', () => [{ id: 'fake', title: 'Fake', status: 'noKey' }]);
  fake.handle('kvai.model.list', () => [{ id: 'fake/m1', name: 'M1', provider: 'fake' }]);
  return fake;
}
async function type(view: Wrapper, text: string): Promise<void> {
  await box(view).setValue(text);
  await box(view).trigger('keydown', { key: 'Enter' });
  await flushPromises();
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('message drafts (KVC-19, ADR 0048)', () => {
  it('M2.4-E139 a failed send keeps the text and attachment through leaving and returning, and retries with its sendId', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, file: { id: 'f1' } }))));
    const fake = chat('drafts-keep');
    fake.handle('kvcoder.message.send', () => { throw offline(); });
    let view = await mounted(ConversationView, fake, { sessionId: 's1' });
    const picker = view.find<HTMLInputElement>('[data-test="composer-files"]');
    Object.defineProperty(picker.element, 'files', { value: [new File(['x'], 'notes.md')], configurable: true });
    await picker.trigger('change');
    await flushPromises();
    await type(view, 'Make a notes page');
    expect(box(view).element.value).toBe('Make a notes page');
    expect(view.findAll('[data-test="attachment"]').map((chip) => chip.text())).toEqual(['notes.md']);
    expect(view.find('[data-test="send-error"]').text()).toContain("Couldn't send: kvwebui.errors.OFFLINE");
    expect(fake.toast).not.toHaveBeenCalled();
    view.unmount();
    const next = chat('drafts-keep');
    next.handle('kvcoder.message.send', () => ({}));
    view = await mounted(ConversationView, next, { sessionId: 's1' });
    expect(box(view).element.value).toBe('Make a notes page');
    expect(view.findAll('[data-test="attachment"]')).toHaveLength(1);
    await box(view).trigger('keydown', { key: 'Enter' });
    await flushPromises();
    const [first] = sends(fake);
    expect(first).toEqual({ sessionId: 's1', text: 'Make a notes page', fileIds: ['f1'], sendId: expect.any(String) });
    expect(sends(next)).toEqual([first]);
    expect(box(view).element.value).toBe('');
    expect(view.find('[data-test="attachment"]').exists()).toBe(false);
    expect(view.find('[data-test="send-error"]').exists()).toBe(false);
    view.unmount();
  });

  it('M2.4-E139 changed text gets a new sendId, and drafts of two chats and two workspaces stay apart', async () => {
    const fake = chat('drafts-apart');
    fake.handle('kvcoder.message.send', () => { throw offline(); });
    const view = await mounted(ConversationView, fake, { sessionId: 's1' });
    await type(view, 'first');
    await type(view, 'second');
    const [one, two] = sends(fake);
    expect(one?.['sendId']).not.toBe(two?.['sendId']);
    view.unmount();
    const otherChat = await mounted(ConversationView, chat('drafts-apart', 's2'), { sessionId: 's2' });
    expect(box(otherChat).element.value).toBe('');
    otherChat.unmount();
    const otherWorkspace = await mounted(ConversationView, chat('drafts-apart-2'), { sessionId: 's1' });
    expect(box(otherWorkspace).element.value).toBe('');
    otherWorkspace.unmount();
  });

  it('M2.4-E140 the box is disabled while a send is on its way, and a second Enter sends nothing', async () => {
    const fake = chat('drafts-busy');
    let finish: (value: object) => void = () => undefined;
    fake.handle('kvcoder.message.send', () => new Promise((resolve) => { finish = resolve; }));
    const view = await mounted(ConversationView, fake, { sessionId: 's1' });
    await type(view, 'once');
    expect(box(view).element.disabled).toBe(true);
    expect(view.find<HTMLButtonElement>('[data-test="send"]').element.disabled).toBe(true);
    await box(view).trigger('keydown', { key: 'Enter' });
    await view.find('[data-test="send"]').trigger('click');
    expect(sends(fake)).toHaveLength(1);
    finish({});
    await flushPromises();
    expect(box(view).element.disabled).toBe(false);
    expect(box(view).element.value).toBe('');
    view.unmount();
  });

  it('M2.4-E140 on the Chat page a retry sends into the chat it created, and creates a new one when that chat is gone', async () => {
    const fake = start('drafts-start');
    let created = 0;
    fake.handle('kvcoder.session.create', () => session({ id: `new-${(created += 1)}`, title: '' }));
    const failures = [offline(), gone()];
    fake.handle('kvcoder.message.send', () => {
      const failure = failures.shift();
      if (failure !== undefined) throw failure;
      return {};
    });
    const view = await mounted(ConversationView, fake);
    await type(view, 'Build it');
    expect(box(view).element.value).toBe('Build it');
    await box(view).trigger('keydown', { key: 'Enter' });
    await flushPromises();
    expect(sends(fake).map((sent) => sent['sessionId'])).toEqual(['new-1', 'new-1']);
    expect(fake.navigate).not.toHaveBeenCalled();
    await box(view).trigger('keydown', { key: 'Enter' });
    await flushPromises();
    expect(sends(fake).map((sent) => sent['sessionId'])).toEqual(['new-1', 'new-1', 'new-2']);
    expect(created).toBe(2);
    expect(fake.navigate).toHaveBeenCalledWith('kvcoder.session', { sessionId: 'new-2' });
    view.unmount();
  });
});
