import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { ProblemError } from '@kvman/sdk';
import ChatStart from '../../web/src/ChatStart.vue';
import type { RegisteredSlash } from '../../web/src/slash-commands.ts';
import { createFakeKvman, type FakeKvman } from './support/fake-kvman.ts';
import { mounted } from './support/fixtures.ts';

type Wrapper = Awaited<ReturnType<typeof mounted>>;

// `todo` and `todo-add` take their texts from kvcoder's own catalog, so the test sees them translated.
const build: RegisteredSlash = { name: 'build-kvman', description: 'kvbuilder.slash.build-kvman', command: 'kvbuilder.build.start', message: 'kvbuilder.slash.build-kvman.message', owner: '@kvman/kvbuilder' };
const todo: RegisteredSlash = { name: 'todo', description: 'kvcoder.ui.newChat', command: 'todo.list.start', owner: '@me/todo' };
const todoAdd: RegisteredSlash = { name: 'todo-add', description: 'kvcoder.ui.attach', command: 'todo.list.start', message: 'kvcoder.ui.send', owner: '@me/todo' };

function startFake(defaultModel: string | null): FakeKvman {
  const fake = createFakeKvman();
  fake.handle('kernel.settings.list', () => [{ key: 'kvai.defaultModel', value: defaultModel }, { key: 'kvcoder.thinking', value: 'medium' }]);
  fake.handle('kernel.settings.set', () => ({}));
  fake.handle('kvai.provider.list', () => [{ id: 'zed', title: 'Zed AI', status: 'ready' }, { id: 'fake', title: 'Fake', status: 'ready' }]);
  fake.handle('kvai.model.list', () => [{ id: 'zed/z1', name: 'Z1', provider: 'zed' }, { id: 'fake/m1', name: 'M1', provider: 'fake' }]);
  fake.handle('kvcoder.session.create', () => ({ id: 's9' }));
  for (const name of ['kvcoder.session.configure', 'kvcoder.message.send', 'todo.list.start', 'kvbuilder.build.start']) fake.handle(name, () => ({}));
  return fake;
}

const failing = (code: string) => (): never => {
  throw new ProblemError({ code, message: 'Failed.' });
};
const start = (fake: FakeKvman, registered: readonly RegisteredSlash[] = [build, todo, todoAdd]): Promise<Wrapper> => mounted(ChatStart, fake, { registered });
const box = (view: Wrapper) => view.find('[data-test="composer-text"]');
const text = (view: Wrapper): string => (box(view).element as HTMLTextAreaElement).value;
const key = (view: Wrapper, name: string) => box(view).trigger('keydown', { key: name });
const rows = (view: Wrapper) => view.findAll('.kvc-slash-row').map((row) => row.find('.kvc-mono').text());
const highlighted = (view: Wrapper) => view.findAll('.kvc-slash-row[data-active="true"]').map((row) => row.find('.kvc-mono').text());
const ran = (fake: FakeKvman) => fake.calls.filter((call) => /^(kvcoder\.(session|message)\.|todo\.|kvbuilder\.)/.test(call.name));

async function run(view: Wrapper, line: string): Promise<void> {
  await box(view).setValue(line);
  await key(view, 'Enter');
  await flushPromises();
}

describe('a registered slash command on the Chat page (08 §8.7, ADR 0028)', () => {
  it('QA40-H2 a registered command creates the chat, runs, sends its message, and opens the chat', async () => {
    const fake = startFake('fake/m1');
    const view = await start(fake);
    await run(view, '/todo-add milk');
    expect(ran(fake)).toEqual([
      { name: 'kvcoder.session.create', input: {} },
      { name: 'todo.list.start', input: { sessionId: 's9', argument: 'milk' } },
      { name: 'kvcoder.message.send', input: { sessionId: 's9', text: 'milk' } },
    ]);
    expect(fake.navigate.mock.calls).toEqual([['kvcoder.session', { sessionId: 's9' }]]);
    expect(text(view)).toBe('');
    view.unmount();
  });

  it("QA40-H3 a bare command sends its translated message", async () => {
    const fake = startFake('fake/m1');
    const view = await start(fake);
    await run(view, '/todo-add');
    expect(ran(fake)).toEqual([
      { name: 'kvcoder.session.create', input: {} },
      { name: 'todo.list.start', input: { sessionId: 's9', argument: '' } },
      { name: 'kvcoder.message.send', input: { sessionId: 's9', text: 'Send' } },
    ]);
    view.unmount();
  });

  it('QA40-H4 a command without a message opens the chat and sends nothing', async () => {
    const fake = startFake('fake/m1');
    const view = await start(fake);
    await run(view, '/todo');
    expect(ran(fake)).toEqual([
      { name: 'kvcoder.session.create', input: {} },
      { name: 'todo.list.start', input: { sessionId: 's9', argument: '' } },
    ]);
    expect(fake.navigate.mock.calls).toEqual([['kvcoder.session', { sessionId: 's9' }]]);
    view.unmount();
  });

  it('QA40-H5 the picked model and thinking level are set before the command', async () => {
    const picked = startFake('fake/m1');
    const view = await start(picked);
    await view.find('[data-test="model-picker"]').trigger('click');
    await view.find('[data-test="model-zed/z1"]').trigger('click');
    await view.find('[data-test="thinking-picker"]').setValue('low');
    await run(view, '/todo');
    expect(ran(picked)).toEqual([
      { name: 'kvcoder.session.create', input: {} },
      { name: 'kvcoder.session.configure', input: { sessionId: 's9', model: 'zed/z1', thinking: 'low' } },
      { name: 'todo.list.start', input: { sessionId: 's9', argument: '' } },
    ]);
    view.unmount();

    const untouched = startFake('fake/m1');
    const second = await start(untouched);
    await run(second, '/todo');
    expect(ran(untouched).map((call) => call.name)).toEqual(['kvcoder.session.create', 'todo.list.start']);
    second.unmount();
  });

  it("QA40-H6 the registered rows can run, kvcoder's own are greyed, and the arrows move over the rows that can run", async () => {
    const view = await start(startFake('fake/m1'), [build, todo]);
    await box(view).setValue('/');
    expect(rows(view)).toEqual(['/compact', '/export', '/fork', '/new', '/prompt', '/rename <title>', '/build-kvman', '/todo']);
    expect(view.findAll('.kvc-slash-row').map((row) => row.attributes('aria-disabled'))).toEqual(['true', 'true', 'true', 'true', 'true', 'true', 'false', 'false']);
    expect(view.find('[data-test="slash-wait"]').text()).toBe('Send a first message to use commands');
    expect(highlighted(view)).toEqual(['/build-kvman']);
    await key(view, 'ArrowDown');
    expect(highlighted(view)).toEqual(['/todo']);
    await key(view, 'ArrowDown');
    expect(highlighted(view)).toEqual(['/build-kvman']);
    await key(view, 'ArrowUp');
    expect(highlighted(view)).toEqual(['/todo']);
    view.unmount();
  });

  it('QA40-H7 Tab completes a registered name, and a click runs it', async () => {
    const fake = startFake('fake/m1');
    const view = await start(fake);
    await box(view).setValue('/to');
    await key(view, 'Tab');
    expect(text(view)).toBe('/todo ');
    await box(view).setValue('/to');
    await view.find('[data-test="slash-todo"]').trigger('click');
    await flushPromises();
    expect(ran(fake)).toEqual([
      { name: 'kvcoder.session.create', input: {} },
      { name: 'todo.list.start', input: { sessionId: 's9', argument: '' } },
    ]);
    expect(text(view)).toBe('');
    view.unmount();
  });

  it('QA40-E1 the line shows only with a greyed row', async () => {
    const view = await start(startFake('fake/m1'));
    await box(view).setValue('/bu');
    expect(rows(view)).toEqual(['/build-kvman']);
    expect(highlighted(view)).toEqual(['/build-kvman']);
    expect(view.find('[data-test="slash-wait"]').exists()).toBe(false);
    view.unmount();
  });

  it("QA40-E2 kvcoder's own commands still run nothing there", async () => {
    const fake = startFake('fake/m1');
    const view = await start(fake);
    await box(view).setValue('/co');
    expect(view.findAll('.kvc-slash-row').map((row) => [row.find('.kvc-mono').text(), row.attributes('aria-disabled'), row.attributes('aria-selected'), row.attributes('data-active')])).toEqual([['/compact', 'true', 'false', 'false']]);
    await key(view, 'Enter');
    await key(view, 'Tab');
    await view.find('[data-test="slash-compact"]').trigger('mousemove');
    await view.find('[data-test="slash-compact"]').trigger('click');
    await flushPromises();
    expect(ran(fake)).toEqual([]);
    expect(highlighted(view)).toEqual([]);
    expect(text(view)).toBe('/co');
    view.unmount();
  });

  it('QA40-E3 a blocked box runs nothing', async () => {
    const fake = startFake(null);
    const view = await start(fake);
    await run(view, '/todo');
    await view.find('[data-test="slash-todo"]').trigger('click');
    await flushPromises();
    expect(ran(fake)).toEqual([]);
    expect(text(view)).toBe('/todo');
    view.unmount();
  });

  it('QA40-E4 a command that fails toasts and sends nothing', async () => {
    const fake = startFake('fake/m1');
    fake.handle('todo.list.start', failing('kvcoder/SESSION_BUSY'));
    const view = await start(fake);
    await run(view, '/todo-add milk');
    expect(fake.toast.mock.calls).toEqual([['kvcoder.errors.SESSION_BUSY', {}, 'error']]);
    expect(ran(fake)).toEqual([
      { name: 'kvcoder.session.create', input: {} },
      { name: 'todo.list.start', input: { sessionId: 's9', argument: 'milk' } },
    ]);
    expect(fake.navigate).not.toHaveBeenCalled();
    view.unmount();
  });

  it('QA40-E5 a chat that cannot be created runs nothing', async () => {
    const fake = startFake('fake/m1');
    fake.handle('kvcoder.session.create', failing('kvcoder/SESSION_BUSY'));
    const view = await start(fake);
    await run(view, '/todo');
    expect(fake.toast.mock.calls).toEqual([['kvcoder.errors.SESSION_BUSY', {}, 'error']]);
    expect(ran(fake)).toEqual([{ name: 'kvcoder.session.create', input: {} }]);
    expect(fake.navigate).not.toHaveBeenCalled();
    view.unmount();
  });

  it('QA40-E6 a failed configure stops the command', async () => {
    const fake = startFake('fake/m1');
    fake.handle('kvcoder.session.configure', failing('kvcoder/SESSION_BUSY'));
    const view = await start(fake);
    await view.find('[data-test="model-picker"]').trigger('click');
    await view.find('[data-test="model-zed/z1"]').trigger('click');
    await run(view, '/todo');
    expect(fake.toast.mock.calls).toEqual([['kvcoder.errors.SESSION_BUSY', {}, 'error']]);
    expect(ran(fake).map((call) => call.name)).toEqual(['kvcoder.session.create', 'kvcoder.session.configure']);
    expect(fake.navigate).not.toHaveBeenCalled();
    view.unmount();
  });

  it('QA40-E7 a message that fails to send toasts, and the page stays', async () => {
    const fake = startFake('fake/m1');
    fake.handle('kvcoder.message.send', failing('kvcoder/SESSION_BUSY'));
    const view = await start(fake);
    await run(view, '/todo-add milk');
    expect(fake.toast.mock.calls).toEqual([['kvcoder.errors.SESSION_BUSY', {}, 'error']]);
    expect(ran(fake).map((call) => call.name)).toEqual(['kvcoder.session.create', 'todo.list.start', 'kvcoder.message.send']);
    expect(fake.navigate).not.toHaveBeenCalled();
    view.unmount();
  });

  it('QA40-E8 an unknown name is still "No such command"', async () => {
    const fake = startFake('fake/m1');
    const view = await start(fake);
    await run(view, '/nothing');
    expect(view.find('[data-test="slash-none"]').text()).toBe('No such command');
    expect(view.find('[data-test="slash-wait"]').exists()).toBe(false);
    expect(rows(view)).toEqual([]);
    expect(ran(fake)).toEqual([]);
    view.unmount();
  });
});
