import { flushPromises, type VueWrapper } from '@vue/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import ConversationView from '../../web/src/ConversationView.vue';
import { messageDraft } from '../../web/src/message-drafts.ts';
import { createFakeKvman, type FakeKvman } from './support/fake-kvman.ts';
import { answer, mounted, serve, session, turn, user } from './support/fixtures.ts';

// Edit and Undo on the person's messages (08 §8.7, ADR 0118, 7).

type Preview = { files: { path: string; state: string }[]; messages: number; running: boolean };
const preview: Preview = { files: [{ path: 'a.ts', state: 'restore' }, { path: 'b.ts', state: 'delete' }, { path: 'c.ts', state: 'restore' }, { path: 'd.ts', state: 'changedSince' }, { path: 'big.bin', state: 'tooLarge' }], messages: 3, running: true };
const slash = { source: { kind: 'extension' as const, name: '@kvman/kvvideo' } };

beforeEach(() => {
  Object.assign(messageDraft('home', 's1'), { text: '', files: [], saved: [], sending: false, error: undefined, attempt: undefined });
});

async function chat(options: { parentId?: string; status?: 'idle' | 'running'; found?: Preview } = {}) {
  const fake = createFakeKvman();
  const messages = [user('one', { source: { kind: 'user' } }), answer('first'), user('two\n\nAttached files:\n- attachments/n.txt', { source: { kind: 'user' }, fileIds: ['img1'] }), answer('second'), user('Make the video.', slash)];
  serve(fake, { found: session({ status: options.status ?? 'idle', ...(options.parentId === undefined ? {} : { parentId: options.parentId }) }), messages: [...messages, user('later', { source: { kind: 'user' }, queued: true })], omitted: 0, turns: [turn({ outcome: 'done', endedAt: '2026-10-01T09:01:00.000Z' })] });
  fake.handle('kvcoder.rewind.files.list', () => options.found ?? preview);
  fake.handle('kvcoder.message.edit', () => ({ restored: ['a.ts'], deleted: [], left: [] }));
  fake.handle('kvcoder.message.undo', () => ({ text: 'Make the video.', fileIds: ['img2'], fileNames: ['shot.png'], attachments: ['attachments/brief.txt'], restored: [], deleted: [], left: [{ path: 'd.ts', reason: 'changedSince' }] }));
  const view = await mounted(ConversationView, fake, { sessionId: 's1' });
  return { fake, view, messages };
}

const persons = (view: VueWrapper) => view.findAll('[data-test="user-message"]');
const has = (node: { find(selector: string): { exists(): boolean } }, test: string): boolean => node.find(`[data-test="${test}"]`).exists();
const called = (fake: FakeKvman, name: string) => fake.calls.filter((call) => call.name === name).map((call) => call.input);

async function openEdit(view: VueWrapper, index: number): Promise<void> {
  await persons(view)[index]?.find('[data-test="message-edit-button"]').trigger('click');
  await flushPromises();
}

describe('Edit and Undo on the messages (ADR 0118, 7)', () => {
  it("QA77-H20 typed messages show Edit, only the latest that started work shows Undo, and a queued one or a helper's chat shows neither", async () => {
    const { view } = await chat();
    expect(persons(view).map((node) => [has(node, 'message-edit-button'), has(node, 'message-undo-button')])).toEqual([[true, false], [true, false], [false, true], [false, false]]);
    const helper = await chat({ parentId: 'p1' });
    expect(helper.view.find('[data-test="message-edit-button"]').exists() || helper.view.find('[data-test="message-undo-button"]').exists()).toBe(false);
  });

  it('QA77-H21 the edit box holds the text, its chips, the notes, and Save & send edits and reads the chat whole', async () => {
    const { fake, view, messages } = await chat({ status: 'running' });
    await openEdit(view, 1);
    const box = view.find('[data-test="message-edit"]');
    expect((box.find('[data-test="edit-text"]').element as HTMLTextAreaElement).value).toBe('two');
    expect(box.findAll('[data-test="edit-image"]')).toHaveLength(1);
    expect(box.find('[data-test="edit-saved"]').text()).toBe('n.txt');
    expect(called(fake, 'kvcoder.rewind.files.list')).toEqual([{ sessionId: 's1', seq: messages[2]?.seq }]);
    expect(box.find('[data-test="rewind-files"]').text()).toBe('Also undo file changes (3 files)');
    expect((box.find('[data-test="rewind-files"] input').element as HTMLInputElement).checked).toBe(true);
    expect(box.findAll('[data-test="rewind-left"] li').map((line) => line.text())).toEqual(['d.ts: changed since, will be left as it is', 'big.bin: too large to restore, will be left as it is']);
    expect(['rewind-shell', 'rewind-later', 'rewind-stops'].map((test) => box.find(`[data-test="${test}"]`).text())).toEqual(["Shell commands' changes aren't undone.", 'Messages after this one will be removed.', 'This stops the agent.']);
    await box.find('[data-test="edit-text"]').setValue('two, better');
    await box.find('[data-test="edit-image"] button').trigger('click');
    const lists = called(fake, 'kvcoder.message.list').length;
    await box.find('[data-test="edit-save"]').trigger('click');
    await flushPromises();
    expect(called(fake, 'kvcoder.message.edit')).toEqual([{ sessionId: 's1', seq: messages[2]?.seq, text: 'two, better', files: true, sendId: expect.any(String), attachments: ['attachments/n.txt'] }]);
    expect(called(fake, 'kvcoder.message.list').slice(lists).some((input) => input['afterSeq'] === undefined)).toBe(true);
    expect(view.find('[data-test="message-edit"]').exists()).toBe(false);
  });

  it('QA77-H22 a confirmed undo puts the message before the send box text, with its chips, and counts the files left', async () => {
    const { fake, view } = await chat();
    await view.find('[data-test="composer-text"]').setValue('draft');
    await view.find('[data-test="message-undo-button"]').trigger('click');
    await flushPromises();
    expect(view.find('[data-test="undo-confirm"]').text()).toContain('Undo this message? It and everything after it are removed.');
    await view.find('[data-test="undo-confirm-button"]').trigger('click');
    await flushPromises();
    expect(called(fake, 'kvcoder.message.undo')).toEqual([{ sessionId: 's1', files: true }]);
    expect((view.find('[data-test="composer-text"]').element as HTMLTextAreaElement).value).toBe('Make the video.\n\ndraft');
    expect(view.findAll('[data-test="attachment"]').map((chip) => chip.text())).toEqual(['shot.png']);
    expect(view.findAll('[data-test="saved-attachment"]').map((chip) => chip.text())).toEqual(['brief.txt']);
    expect(fake.toast).toHaveBeenCalledWith('kvcoder.ui.rewind.left', { count: 1 });
    await view.find('[data-test="send"]').trigger('click');
    await flushPromises();
    expect(called(fake, 'kvcoder.message.send').at(-1)).toMatchObject({ text: 'Make the video.\n\ndraft', fileIds: ['img2'], attachments: ['attachments/brief.txt'] });
  });

  it('QA77-E19 Save waits for text, Esc and Cancel close without a call, and a failed edit keeps the box with its reason', async () => {
    const { fake, view } = await chat();
    await openEdit(view, 0);
    await view.find('[data-test="edit-text"]').setValue('  ');
    expect(view.find('[data-test="edit-save"]').attributes('disabled')).toBeDefined();
    await view.find('[data-test="message-edit"]').trigger('keydown', { key: 'Escape' });
    expect(view.find('[data-test="message-edit"]').exists()).toBe(false);
    await openEdit(view, 0);
    await view.find('[data-test="edit-cancel"]').trigger('click');
    expect(view.find('[data-test="message-edit"]').exists()).toBe(false);
    expect(called(fake, 'kvcoder.message.edit')).toEqual([]);
    fake.handle('kvcoder.message.edit', () => {
      throw Object.assign(new Error('refused'), { problem: { code: 'VALIDATION_FAILED', message: 'refused', params: {} } });
    });
    await openEdit(view, 0);
    await view.find('[data-test="edit-save"]').trigger('click');
    await flushPromises();
    expect(view.find('[data-test="message-edit"]').exists()).toBe(true);
    expect(view.find('[data-test="rewind-error"]').exists()).toBe(true);
  });

  it('QA77-E20 with no file to undo there is no checkbox, and the later messages are still named', async () => {
    const { view } = await chat({ found: { files: [], messages: 2, running: false } });
    await openEdit(view, 0);
    expect(view.find('[data-test="rewind-files"]').exists()).toBe(false);
    expect(view.find('[data-test="rewind-later"]').exists()).toBe(true);
    expect(view.find('[data-test="rewind-stops"]').exists()).toBe(false);
  });
});
