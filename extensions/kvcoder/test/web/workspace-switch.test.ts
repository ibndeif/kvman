import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProblemError } from '@kvman/sdk';
import ConversationView from '../../web/src/ConversationView.vue';
import { createFakeKvman, type FakeKvman } from './support/fake-kvman.ts';
import { mounted, serve, session, turn, user } from './support/fixtures.ts';

afterEach(() => {
  vi.useRealTimers();
});

const other = { id: 'other', name: 'shop', path: '/work/shop' };
const third = { id: 'third', name: 'blog', path: '/work/blog' };

// A chat `s1` that exists in `home` only, as the kernel answers: any other workspace has no such session.
function world(newest: Record<string, string | undefined>): FakeKvman {
  const fake = createFakeKvman();
  serve(fake, { found: session(), messages: [user('go')], omitted: 0, turns: [turn()] });
  const inHome = (name: string, answer: () => unknown): void =>
    fake.handle(name, () => {
      if (fake.workspace.value.id !== 'home') throw new ProblemError({ code: 'NOT_FOUND', message: 'No such session.' });
      return answer();
    });
  inHome('kvcoder.session.get', () => session());
  inHome('kvcoder.message.list', () => ({ messages: [user('go')], omitted: 0 }));
  inHome('kvcoder.turn.list', () => [turn()]);
  inHome('kvcoder.artifact.list', () => []);
  fake.handle('kvcoder.session.list', () => {
    const id = newest[fake.workspace.value.id];
    return id === undefined ? [] : [session({ id })];
  });
  fake.handle('kernel.settings.list', () => []);
  return fake;
}

const reads = (fake: FakeKvman) => fake.calls.filter((call) => call.input['sessionId'] === 's1').length;
const lists = (fake: FakeKvman) => fake.calls.filter((call) => call.name === 'kvcoder.session.list');

describe('a workspace switch while a chat is open (08 §8.7, ADR 0016)', () => {
  it("QA23-H1 a switch opens the selected workspace's newest chat, and QA23-E1 reads nothing more for the old one", async () => {
    vi.useFakeTimers();
    const fake = world({ other: 's9' });
    const view = await mounted(ConversationView, fake, { sessionId: 's1' });
    expect(view.find('[data-test="session-title"]').text()).toBe('Notes page');
    const before = reads(fake);
    fake.workspace.value = other;
    await flushPromises();
    expect(lists(fake)).toEqual([{ name: 'kvcoder.session.list', input: { limit: 1 } }]);
    expect(fake.navigate.mock.calls).toEqual([['kvcoder.session', { sessionId: 's9' }]]);
    expect(view.find('[data-test="session-title"]').exists()).toBe(false);
    expect(view.find('[data-test="chat-start"]').exists()).toBe(false);
    await vi.advanceTimersByTimeAsync(11_000);
    expect(reads(fake)).toBe(before);
    expect(fake.toast).not.toHaveBeenCalled();
    view.unmount();
  });

  it('QA23-H2 a workspace with no chat opens a new chat', async () => {
    const fake = world({});
    const view = await mounted(ConversationView, fake, { sessionId: 's1' });
    fake.workspace.value = other;
    await flushPromises();
    expect(fake.navigate.mock.calls).toEqual([['kvcoder.chat']]);
    expect(fake.toast).not.toHaveBeenCalled();
    await view.setProps({ sessionId: undefined });
    expect(view.find('[data-test="chat-start"]').exists()).toBe(true);
    view.unmount();
  });

  it('QA23-E2 the Chat page stays the Chat page', async () => {
    const fake = world({ other: 's9' });
    const view = await mounted(ConversationView, fake);
    fake.workspace.value = other;
    await flushPromises();
    expect(fake.navigate).not.toHaveBeenCalled();
    expect(lists(fake)).toEqual([]);
    expect(view.find('[data-test="chat-start"]').exists()).toBe(true);
    view.unmount();
  });

  it('QA23-E3 a second switch before the first has answered follows the last one', async () => {
    const fake = world({ other: 's9', third: 's7' });
    const view = await mounted(ConversationView, fake, { sessionId: 's1' });
    const answers: (() => void)[] = [];
    fake.handle('kvcoder.session.list', () => {
      const id = fake.workspace.value.id === 'other' ? 's9' : 's7';
      return new Promise((resolve) => answers.push(() => resolve([session({ id })])));
    });
    fake.workspace.value = other;
    await flushPromises();
    fake.workspace.value = third;
    await flushPromises();
    for (const answer of answers) answer();
    await flushPromises();
    expect(fake.navigate.mock.calls).toEqual([['kvcoder.session', { sessionId: 's7' }]]);
    view.unmount();
  });

  it('QA23-E4 a list that fails toasts its Problem once and opens a new chat', async () => {
    const fake = world({});
    const view = await mounted(ConversationView, fake, { sessionId: 's1' });
    fake.handle('kvcoder.session.list', () => {
      throw new ProblemError({ code: 'UNAVAILABLE', message: 'Down.' });
    });
    fake.workspace.value = other;
    await flushPromises();
    expect(fake.toast.mock.calls).toEqual([['kernel.errors.UNAVAILABLE', {}, 'error']]);
    expect(fake.navigate.mock.calls).toEqual([['kvcoder.chat']]);
    view.unmount();
  });
});
