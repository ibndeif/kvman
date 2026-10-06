import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { ProblemError } from '@kvman/sdk';
import ConversationView from '../../web/src/ConversationView.vue';
import MessageComposer from '../../web/src/MessageComposer.vue';
import type { RegisteredSlash } from '../../web/src/slash-commands.ts';
import { createFakeKvman, type FakeKvman } from './support/fake-kvman.ts';
import { mounted, serve, session, turn, user } from './support/fixtures.ts';

type Wrapper = Awaited<ReturnType<typeof mounted>>;

// `todo` and `todo-add` take their texts from kvcoder's own catalog, so the test sees them translated.
const build: RegisteredSlash = { name: 'build-kvman', description: 'kvbuilder.slash.build-kvman', command: 'kvbuilder.build.start', message: 'kvbuilder.slash.build-kvman.message', owner: '@kvman/kvbuilder' };
const todo: RegisteredSlash = { name: 'todo', description: 'kvcoder.ui.newChat', command: 'todo.list.start', owner: '@me/todo' };
const todoAdd: RegisteredSlash = { name: 'todo-add', description: 'kvcoder.ui.attach', command: 'todo.list.start', message: 'kvcoder.ui.send', owner: '@me/todo' };

function world(registered: readonly RegisteredSlash[]): FakeKvman {
  const fake = createFakeKvman();
  serve(fake, { found: session(), messages: [user('go')], omitted: 0, turns: [turn()] });
  fake.handle('kvcoder.slash.list', () => registered);
  for (const name of ['kvcoder.message.send', 'todo.list.start', 'kvbuilder.build.start']) fake.handle(name, () => ({}));
  return fake;
}

const box = (view: Wrapper) => view.find('[data-test="composer-text"]');
const key = (view: Wrapper, name: string) => box(view).trigger('keydown', { key: name });
const rows = (view: Wrapper) => view.findAll('.kvc-slash-row').map((row) => row.find('.kvc-mono').text());
const ran = (fake: FakeKvman) => fake.calls.filter((call) => /^(todo\.list\.start|kvbuilder\.build\.start|kvcoder\.message\.send)$/.test(call.name));

async function run(view: Wrapper, text: string): Promise<void> {
  await box(view).setValue(text);
  await key(view, 'Enter');
  await flushPromises();
}

describe('slash commands that extensions registered, in the send box (08 §8.7, ADR 0027, 9)', () => {
  it("QA39-H14 the list has the registered commands after kvcoder's own, each with its translated description", async () => {
    const view = await mounted(ConversationView, world([build, todo]), { sessionId: 's1' });
    await box(view).setValue('/');
    expect(rows(view)).toEqual(['/compact', '/export', '/fork', '/new', '/prompt', '/rename <title>', '/build-kvman', '/todo']);
    expect(view.find('[data-test="slash-todo"] .kvc-muted').text()).toBe('New chat');
    await box(view).setValue('/to');
    expect(rows(view)).toEqual(['/todo']);
    await key(view, 'Tab');
    expect((box(view).element as HTMLTextAreaElement).value).toBe('/todo ');
    view.unmount();
  });

  it('QA39-H15 a registered command is called with the chat and the argument, and then its message is sent', async () => {
    const fake = world([todo, todoAdd]);
    const view = await mounted(ConversationView, fake, { sessionId: 's1' });
    await run(view, '/todo-add milk');
    await run(view, '/todo-add');
    await run(view, '/todo');
    expect(ran(fake)).toEqual([
      { name: 'todo.list.start', input: { sessionId: 's1', argument: 'milk' } },
      { name: 'kvcoder.message.send', input: { sessionId: 's1', text: 'milk' } },
      { name: 'todo.list.start', input: { sessionId: 's1', argument: '' } },
      { name: 'kvcoder.message.send', input: { sessionId: 's1', text: 'Send' } },
      { name: 'todo.list.start', input: { sessionId: 's1', argument: '' } },
    ]);
    expect((box(view).element as HTMLTextAreaElement).value).toBe('');
    view.unmount();
  });

  it('QA39-E20 a registered command that fails toasts its Problem and sends nothing', async () => {
    const fake = world([todoAdd]);
    fake.handle('todo.list.start', () => {
      throw new ProblemError({ code: 'kvcoder/SESSION_BUSY', message: 'Busy.' });
    });
    const view = await mounted(ConversationView, fake, { sessionId: 's1' });
    await run(view, '/todo-add milk');
    expect(fake.toast.mock.calls).toEqual([['kvcoder.errors.SESSION_BUSY', {}, 'error']]);
    expect(ran(fake)).toEqual([{ name: 'todo.list.start', input: { sessionId: 's1', argument: 'milk' } }]);
    view.unmount();
  });

  it('QA39-E21 with no chat yet a registered command is greyed, and nothing runs or is sent', async () => {
    const fake = world([build]);
    fake.handle('kernel.settings.list', () => [{ key: 'kvai.defaultModel', value: 'fake/m1' }]);
    const start = await mounted(ConversationView, fake);
    await box(start).setValue('/build');
    expect(start.find('[data-test="slash-wait"]').text()).toBe('Send a first message to use commands');
    expect(start.findAll('.kvc-slash-row').map((row) => [row.find('.kvc-mono').text(), row.attributes('aria-disabled'), row.attributes('data-active')])).toEqual([['/build-kvman', 'true', 'false']]);
    await key(start, 'Enter');
    await start.find('[data-test="slash-build-kvman"]').trigger('click');
    await flushPromises();
    expect(ran(fake)).toEqual([]);
    expect(fake.calls.filter((call) => call.name.startsWith('kvcoder.session.'))).toEqual([]);
    start.unmount();
  });

  it('QA39-E22 while the send box is blocked a registered command does not run', async () => {
    const fake = createFakeKvman();
    const blocked = await mounted(MessageComposer, fake, { running: false, placeholder: 'Message', commands: 'run', registered: [todo], blocked: true });
    await run(blocked, '/todo');
    expect(blocked.emitted('registered')).toBeUndefined();
    expect((box(blocked).element as HTMLTextAreaElement).value).toBe('/todo');
    blocked.unmount();
    const open = await mounted(MessageComposer, fake, { running: false, placeholder: 'Message', commands: 'run', registered: [todo] });
    await run(open, '/todo now');
    expect(open.emitted('registered')).toEqual([[todo, 'now']]);
    open.unmount();
  });

  it('QA39-E23 an unknown name is still "No such command", and runs nothing', async () => {
    const fake = world([build, todo]);
    const view = await mounted(ConversationView, fake, { sessionId: 's1' });
    await run(view, '/nothing');
    expect(view.find('[data-test="slash-none"]').text()).toBe('No such command');
    expect(rows(view)).toEqual([]);
    expect(ran(fake)).toEqual([]);
    view.unmount();
  });
});
