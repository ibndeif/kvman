import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProblemError } from '@kvman/sdk';
import ConversationView from '../../web/src/ConversationView.vue';
import { createFakeKvman, type FakeKvman } from './support/fake-kvman.ts';
import { message, mounted, serve, session, turn, user, type World } from './support/fixtures.ts';

type Wrapper = Awaited<ReturnType<typeof mounted>>;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// A command's answer that waits until the test gives it.
function held() {
  let give = (answer: unknown): void => void answer;
  let fail = (error: unknown): void => void error;
  const answer = new Promise<unknown>((resolve, reject) => {
    give = resolve;
    fail = reject;
  });
  return { answer, give: (value: unknown) => give(value), fail: (error: unknown) => fail(error) };
}

const answers: Record<string, unknown> = { compact: { summarized: true }, export: { fileId: 'f9' }, fork: session({ id: 's2' }), rename: {} };

function world(): { fake: FakeKvman; chat: World; hold(name: string): ReturnType<typeof held> } {
  const fake = createFakeKvman();
  const chat: World = { found: session(), messages: [user('go')], omitted: 0, turns: [turn()] };
  serve(fake, chat);
  fake.handle('kvcoder.message.send', () => ({}));
  fake.handle('kvcoder.prompt.get', () => ({ prompt: 'You are kvman Coder', sections: [] }));
  vi.stubGlobal('location', { ...window.location, assign: vi.fn() });
  const hold = (name: string) => {
    const waiting = held();
    fake.handle(`kvcoder.session.${name}`, () => waiting.answer);
    return waiting;
  };
  return { fake, chat, hold };
}

const box = (view: Wrapper) => view.find('[data-test="composer-text"]');
const line = (view: Wrapper) => view.find('[data-test="command-progress"]');
const title = (view: Wrapper) => view.find('[data-test="command-title"]').text();
const sends = (fake: FakeKvman) => fake.calls.filter((call) => call.name === 'kvcoder.message.send');
const ran = (fake: FakeKvman, name: string) => fake.calls.filter((call) => call.name === `kvcoder.session.${name}`);

async function slash(view: Wrapper, text: string): Promise<void> {
  await box(view).setValue(text);
  await box(view).trigger('keydown', { key: 'Enter' });
  await flushPromises();
}

async function menu(view: Wrapper, item: string): Promise<void> {
  await view.find('[data-test="chat-menu"]').trigger('click');
  await view.find(`[data-test="menu-${item}"]`).trigger('click');
  await flushPromises();
}

async function end(waiting: ReturnType<typeof held>, name: string): Promise<void> {
  waiting.give(answers[name]);
  await flushPromises();
}

describe('a running chat action shows its progress (08 §8.7, ADR 0019)', () => {
  it('QA26-H1 a slash command shows its line, with its seconds, until it answers', async () => {
    vi.useFakeTimers({ now: Date.parse('2026-10-01T09:10:00.000Z') });
    const { fake, hold } = world();
    const compact = hold('compact');
    const view = await mounted(ConversationView, fake, { sessionId: 's1' });
    expect(line(view).exists()).toBe(false);
    await slash(view, '/compact');
    expect(line(view).attributes('data-command')).toBe('compact');
    expect(title(view)).toBe('Summarizing earlier messages…');
    expect(view.find('[data-test="command-seconds"]').text()).toBe('0 s');
    await vi.advanceTimersByTimeAsync(5000);
    expect(view.find('[data-test="command-seconds"]').text()).toBe('5 s');
    await end(compact, 'compact');
    expect(line(view).exists()).toBe(false);
    view.unmount();
  });

  it('QA26-H2 every waiting action names itself, from the send box and from the menu, and /new and /prompt show no line', async () => {
    const { fake, hold } = world();
    const view = await mounted(ConversationView, fake, { sessionId: 's1' });
    const texts = { compact: 'Summarizing earlier messages…', export: 'Exporting the chat…', fork: 'Copying the chat into a new one…', rename: 'Renaming the chat…' };
    for (const [name, text] of Object.entries(texts)) {
      for (const start of [() => slash(view, name === 'rename' ? '/rename Shop' : `/${name}`), () => (name === 'rename' ? renameFromMenu(view) : menu(view, name))]) {
        const waiting = hold(name);
        await start();
        expect([name, title(view)]).toEqual([name, text]);
        await end(waiting, name);
        expect(line(view).exists()).toBe(false);
      }
      expect(ran(fake, name)).toHaveLength(2);
    }
    await slash(view, '/prompt');
    expect(line(view).exists()).toBe(false);
    await slash(view, '/new');
    expect(line(view).exists()).toBe(false);
    view.unmount();
  });

  it('QA26-H3 while one runs the box takes text, sends nothing, runs no second command, and the menu items are disabled', async () => {
    const { fake, hold } = world();
    const compact = hold('compact');
    hold('fork');
    const view = await mounted(ConversationView, fake, { sessionId: 's1' });
    await slash(view, '/compact');
    await slash(view, 'and then this');
    await view.find('[data-test="send"]').trigger('click');
    expect(view.find('[data-test="send"]').attributes('disabled')).toBeDefined();
    expect((box(view).element as HTMLTextAreaElement).value).toBe('and then this');
    await slash(view, '/fork');
    expect((box(view).element as HTMLTextAreaElement).value).toBe('/fork');
    await view.find('[data-test="chat-menu"]').trigger('click');
    expect(['rename', 'fork', 'export', 'compact', 'prompt', 'delete'].map((item) => view.find(`[data-test="menu-${item}"]`).attributes('disabled') !== undefined)).toEqual([true, true, true, true, false, false]);
    expect([sends(fake), ran(fake, 'fork'), ran(fake, 'compact').length]).toEqual([[], [], 1]);
    await end(compact, 'compact');
    await slash(view, 'and then this');
    expect(sends(fake).map((call) => call.input['text'])).toEqual(['and then this']);
    view.unmount();
  });

  it('QA26-H4 and QA27-H6 a summary by hand says how it ended, naming the kept messages in effect', async () => {
    const { fake, hold } = world();
    fake.handle('kernel.settings.list', () => [{ key: 'kvcoder.compactKeep', value: 6, source: 'global' }]);
    const view = await mounted(ConversationView, fake, { sessionId: 's1' });
    for (const summarized of [true, false]) {
      const compact = hold('compact');
      await slash(view, '/compact');
      compact.give({ summarized });
      await flushPromises();
    }
    expect(fake.toast.mock.calls).toEqual([['kvcoder.ui.summarized', {}, 'success'], ['kvcoder.ui.nothingToSummarize', { count: 6 }]]);
    expect(fake.kvman.t('kvcoder.ui.nothingToSummarize', { count: 6 })).toBe('Nothing to summarize yet: the messages before the last 6 are still short');
    view.unmount();
  });

  it('QA26-E1 a command that fails removes the line, toasts its Problem only, and Send works again', async () => {
    const { fake, hold } = world();
    const compact = hold('compact');
    const view = await mounted(ConversationView, fake, { sessionId: 's1' });
    await slash(view, '/compact');
    compact.fail(new ProblemError({ code: 'kvcoder/SESSION_BUSY', message: 'Busy.' }));
    await flushPromises();
    expect(line(view).exists()).toBe(false);
    expect(fake.toast.mock.calls).toEqual([['kvcoder.errors.SESSION_BUSY', {}, 'error']]);
    await slash(view, 'still here');
    expect(sends(fake)).toHaveLength(1);
    view.unmount();
  });

  it('QA26-E2 a summary that failed has its notice in the chat and no toast', async () => {
    const { fake, chat, hold } = world();
    const compact = hold('compact');
    const view = await mounted(ConversationView, fake, { sessionId: 's1' });
    await slash(view, '/compact');
    chat.messages = [...chat.messages, message('notice', { code: 'SUMMARY_FAILED', params: { code: 'kvai/PROVIDER_ERROR' } })];
    compact.give({ summarized: false });
    await flushPromises();
    expect(view.find('[data-test="notice"]').exists()).toBe(true);
    expect(fake.toast.mock.calls).toEqual([]);
    view.unmount();
  });

  it('QA26-E3 a waiting action started from the prompt returns to the chat, where its line is', async () => {
    const { fake, hold } = world();
    const compact = hold('compact');
    const view = await mounted(ConversationView, fake, { sessionId: 's1' });
    await slash(view, '/prompt');
    expect(view.find('[data-test="prompt-text"]').exists()).toBe(true);
    await slash(view, '/compact');
    expect(view.find('[data-test="prompt-text"]').exists()).toBe(false);
    expect([view.find('[data-test="user-message"]').exists(), line(view).exists()]).toEqual([true, true]);
    await end(compact, 'compact');
    view.unmount();
  });
});

async function renameFromMenu(view: Wrapper): Promise<void> {
  await menu(view, 'rename');
  await view.find('[data-test="rename-input"]').setValue('Shop');
  await view.find('[data-test="rename-input"]').trigger('blur');
  await flushPromises();
}
