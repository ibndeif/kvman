import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProblemError } from '@kvman/sdk';
import ChatStart from '../../web/src/ChatStart.vue';
import ConversationView from '../../web/src/ConversationView.vue';
import { createFakeKvman, type FakeKvman } from './support/fake-kvman.ts';
import { mounted, serve, session, turn, user } from './support/fixtures.ts';

type Wrapper = Awaited<ReturnType<typeof mounted>>;

afterEach(() => {
  vi.unstubAllGlobals();
});

function world(): FakeKvman {
  const fake = createFakeKvman();
  serve(fake, { found: session(), messages: [user('go')], omitted: 0, turns: [turn()] });
  for (const name of ['kvcoder.message.send', 'kvcoder.session.rename']) fake.handle(name, () => ({}));
  fake.handle('kvcoder.session.compact', () => ({ summarized: true }));
  fake.handle('kvcoder.session.export', () => ({ fileId: 'f9' }));
  fake.handle('kvcoder.session.fork', () => session({ id: 's2' }));
  fake.handle('kvcoder.prompt.get', () => ({ prompt: 'You are kvman Coder', sections: [] }));
  return fake;
}

const box = (view: Wrapper) => view.find('[data-test="composer-text"]');
const key = (view: Wrapper, name: string) => box(view).trigger('keydown', { key: name });
const rows = (view: Wrapper) => view.findAll('.kvc-slash-row').map((row) => row.find('.kvc-mono').text());
const active = (view: Wrapper) => view.find('.kvc-slash-row[data-active="true"] .kvc-mono').text();
const ran = (fake: FakeKvman) => fake.calls.filter((call) => /^kvcoder\.(session\.(compact|export|fork|rename)|message\.send)$/.test(call.name));

async function run(view: Wrapper, text: string): Promise<void> {
  await box(view).setValue(text);
  await key(view, 'Enter');
  await flushPromises();
}

describe("the send box's slash commands (08 §8.7, ADR 0017, 6 and 11)", () => {
  it('QA24-H9 a slash command runs its action, sends no message, and empties the box', async () => {
    const fake = world();
    const view = await mounted(ConversationView, fake, { sessionId: 's1' });
    await box(view).setValue('/co');
    expect(rows(view)).toEqual(['/compact']);
    expect(view.find('[data-test="slash-compact"] .kvc-muted').text()).toBe('Summarize the earlier messages now');
    await key(view, 'Enter');
    await flushPromises();
    expect(ran(fake)).toEqual([{ name: 'kvcoder.session.compact', input: { sessionId: 's1' } }]);
    expect((box(view).element as HTMLTextAreaElement).value).toBe('');
    expect(view.find('[data-test="slash-list"]').exists()).toBe(false);
    view.unmount();
  });

  it('QA24-H10 every command does its action', async () => {
    const fake = world();
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    const view = await mounted(ConversationView, fake, { sessionId: 's1' });
    await run(view, '/export');
    expect(assign).toHaveBeenCalledWith('/api/files/f9?workspaceId=home');
    await run(view, '/fork');
    await run(view, '/new');
    expect(fake.navigate.mock.calls).toEqual([['kvcoder.session', { sessionId: 's2' }], ['kvcoder.chat']]);
    await run(view, '/rename  Shop  ');
    expect(ran(fake).map((call) => [call.name, call.input['title']])).toEqual([['kvcoder.session.export', undefined], ['kvcoder.session.fork', undefined], ['kvcoder.session.rename', 'Shop']]);
    await run(view, '/prompt');
    expect(view.find('[data-test="prompt-text"]').text()).toBe('You are kvman Coder');
    view.unmount();
  });

  it('QA24-E3 the list filters by what is typed, moves with the arrows, wraps, and Tab completes the name', async () => {
    const view = await mounted(ConversationView, world(), { sessionId: 's1' });
    await box(view).setValue('/');
    expect(rows(view)).toEqual(['/compact', '/export', '/fork', '/new', '/prompt', '/rename <title>']);
    expect(active(view)).toBe('/compact');
    await key(view, 'ArrowUp');
    expect(active(view)).toBe('/rename <title>');
    await key(view, 'ArrowDown');
    await key(view, 'ArrowDown');
    expect(active(view)).toBe('/export');
    await box(view).setValue('/e');
    expect(rows(view)).toEqual(['/export']);
    await key(view, 'Tab');
    expect((box(view).element as HTMLTextAreaElement).value).toBe('/export ');
    view.unmount();
  });

  it("QA24-E4 an unknown command isn't sent, and QA24-E5 /rename needs a title", async () => {
    const fake = world();
    const view = await mounted(ConversationView, fake, { sessionId: 's1' });
    await run(view, '/nope');
    expect(view.find('[data-test="slash-none"]').text()).toBe('No such command');
    await view.find('[data-test="send"]').trigger('click');
    await run(view, '/rename');
    expect(rows(view)).toEqual(['/rename <title>']);
    await run(view, '/rename   ');
    expect(ran(fake)).toEqual([]);
    expect((box(view).element as HTMLTextAreaElement).value).toBe('/rename   ');
    view.unmount();
  });

  it('QA24-E6 Escape hides the list until the text changes, and two lines or no leading slash are a message', async () => {
    const fake = world();
    const view = await mounted(ConversationView, fake, { sessionId: 's1' });
    await box(view).setValue('/f');
    await key(view, 'Escape');
    expect(view.find('[data-test="slash-list"]').exists()).toBe(false);
    await box(view).setValue('/fo');
    expect(rows(view)).toEqual(['/fork']);
    await run(view, '/fork\nand more');
    await run(view, 'use /fork here');
    expect(ran(fake).map((call) => [call.name, call.input['text']])).toEqual([['kvcoder.message.send', '/fork\nand more'], ['kvcoder.message.send', 'use /fork here']]);
    view.unmount();
  });

  it('QA25-E6 a slash text on the Chat page shows the list greyed, with why, and sends nothing', async () => {
    const fake = world();
    fake.handle('kernel.settings.list', () => [{ key: 'kvai.defaultModel', value: 'fake/m1' }]);
    fake.handle('kvcoder.session.create', () => session({ id: 's5' }));
    const start = await mounted(ChatStart, fake);
    await box(start).setValue('/co');
    expect(start.find('[data-test="slash-wait"]').text()).toBe('Send a first message to use commands');
    expect(start.findAll('.kvc-slash-row').map((row) => [row.find('.kvc-mono').text(), row.attributes('aria-disabled'), row.attributes('data-active')])).toEqual([['/compact', 'true', 'false']]);
    await key(start, 'Enter');
    await start.find('[data-test="slash-compact"]').trigger('click');
    await start.find('[data-test="send"]').trigger('click');
    await key(start, 'Tab');
    await flushPromises();
    expect(fake.calls.filter((call) => call.name.startsWith('kvcoder.session.') || call.name.startsWith('kvcoder.message.'))).toEqual([]);
    expect((box(start).element as HTMLTextAreaElement).value).toBe('/co');
    await box(start).setValue('Build it');
    await key(start, 'Enter');
    await flushPromises();
    expect(ran(fake)).toEqual([{ name: 'kvcoder.message.send', input: { sessionId: 's5', text: 'Build it' } }]);
    start.unmount();
  });

  it('QA24-E8 a command that fails toasts its Problem', async () => {
    const fake = world();
    fake.handle('kvcoder.session.compact', () => {
      throw new ProblemError({ code: 'kvcoder/SESSION_BUSY', message: 'Busy.' });
    });
    const view = await mounted(ConversationView, fake, { sessionId: 's1' });
    await run(view, '/compact');
    expect(fake.toast.mock.calls).toEqual([['kvcoder.errors.SESSION_BUSY', {}, 'error']]);
    view.unmount();
  });
});
