import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ConversationView from '../../web/src/ConversationView.vue';
import { createFakeKvman, type FakeKvman } from './support/fake-kvman.ts';
import { mounted, serve, session, turn, user } from './support/fixtures.ts';

type Wrapper = Awaited<ReturnType<typeof mounted>>;

afterEach(() => {
  vi.useRealTimers();
});

function world(): FakeKvman {
  const fake = createFakeKvman();
  serve(fake, { found: session(), messages: [user('go')], omitted: 0, turns: [turn()] });
  fake.handle('kvcoder.session.configure', () => ({}));
  fake.handle('kernel.settings.set', () => ({}));
  fake.handle('kvcoder.prompt.get', () => ({ prompt: 'You are kvman Coder', sections: [] }));
  return fake;
}

const has = (view: Wrapper, name: string): boolean => view.find(`[data-test="${name}"]`).exists();
const press = (view: Wrapper, name: string) => view.find(`[data-test="${name}"]`).trigger('click');

async function outside(): Promise<void> {
  document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  await flushPromises();
}

async function escape(): Promise<void> {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  await flushPromises();
}

describe("the chat's header, its menu, and the send box's pickers (08 §8.7, ADR 0017, 3 and 8 to 10)", () => {
  it('QA24-H4 the menu and the delete confirmation close on a press outside and on Escape', async () => {
    const view = await mounted(ConversationView, world(), { sessionId: 's1' });
    await press(view, 'chat-menu');
    expect(has(view, 'chat-menu-items')).toBe(true);
    await view.find('[data-test="chat-menu-items"]').trigger('pointerdown');
    expect(has(view, 'chat-menu-items')).toBe(true);
    await outside();
    expect(has(view, 'chat-menu-items')).toBe(false);
    await press(view, 'chat-menu');
    await escape();
    expect(has(view, 'chat-menu-items')).toBe(false);
    for (const close of [outside, escape]) {
      await press(view, 'chat-menu');
      await press(view, 'menu-delete');
      expect(has(view, 'delete-confirm')).toBe(true);
      await close();
      expect(has(view, 'delete-confirm')).toBe(false);
    }
    view.unmount();
  });

  it('QA24-H5 the header has the title, totals, and menu only, and the send box has the model and thinking pickers', async () => {
    const fake = world();
    const view = await mounted(ConversationView, fake, { sessionId: 's1' });
    const header = view.find('header');
    expect(header.findAll('[data-test]').map((part) => part.attributes('data-test'))).toEqual(['session-title', 'session-totals', 'chat-menu']);
    const row = view.find('.kvc-composer-row');
    expect(row.findAll('button, select').map((control) => control.attributes('data-test') ?? control.attributes('aria-label'))).toEqual(['Attach files', 'model-picker', 'thinking-picker', 'send']);
    await row.find('[data-test="model-picker"]').trigger('click');
    await row.find('[data-test="model-fake/m2"]').trigger('click');
    await flushPromises();
    expect(fake.calls.filter((call) => call.name === 'kvcoder.session.configure').map((call) => call.input)).toEqual([{ sessionId: 's1', model: 'fake/m2' }]);
    view.unmount();
  });

  it('QA24-H6 the prompt is a menu item, with a way back from the prompt and from the menu', async () => {
    const view = await mounted(ConversationView, world(), { sessionId: 's1' });
    expect(has(view, 'tab-prompt')).toBe(false);
    await press(view, 'chat-menu');
    expect(view.find('[data-test="menu-prompt"]').text()).toBe('Show the prompt');
    await press(view, 'menu-prompt');
    await flushPromises();
    expect(has(view, 'chat-menu-items')).toBe(false);
    expect(view.find('[data-test="prompt-text"]').text()).toBe('You are kvman Coder');
    expect(view.find('[data-test="prompt-back"]').text()).toBe('Back to the chat');
    await press(view, 'prompt-back');
    expect(has(view, 'prompt-text')).toBe(false);
    expect(has(view, 'user-message')).toBe(true);
    await press(view, 'chat-menu');
    await press(view, 'menu-prompt');
    await press(view, 'chat-menu');
    expect(view.find('[data-test="menu-prompt"]').text()).toBe('Back to the chat');
    await press(view, 'menu-prompt');
    expect(has(view, 'prompt-text')).toBe(false);
    view.unmount();
  });

  it("QA25-H4 the header's time counts the running turn, and an idle session shows its own", async () => {
    vi.useFakeTimers({ now: Date.parse('2026-10-01T09:00:30.000Z') });
    const fake = world();
    const running = { found: session({ status: 'running', durationMs: 60_000 }), messages: [user('go')], omitted: 0, turns: [turn({ startedAt: '2026-10-01T09:00:00.000Z' })] };
    serve(fake, running);
    const view = await mounted(ConversationView, fake, { sessionId: 's1' });
    const totals = (): string => view.find('[data-test="session-totals"]').text();
    expect(totals()).toMatch(/^2 min ·/);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(totals()).toMatch(/^3 min ·/);
    running.found = session({ status: 'idle', durationMs: 60_000 });
    running.turns = [turn({ startedAt: '2026-10-01T09:00:00.000Z', outcome: 'done' })];
    await vi.advanceTimersByTimeAsync(5000);
    expect(totals()).toMatch(/^1 min ·/);
    view.unmount();
  });
});
