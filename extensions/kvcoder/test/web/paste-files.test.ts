import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ConversationView from '../../web/src/ConversationView.vue';
import { createFakeKvman, type FakeKvman } from './support/fake-kvman.ts';
import { mounted, serve, session, turn, user } from './support/fixtures.ts';

type Wrapper = Awaited<ReturnType<typeof mounted>>;

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'clipboard');
});

// The clipboard as a direct read gives it: items, each offering its kinds.
function clipboard(read: () => Promise<{ types: string[]; getType: (kind: string) => Promise<Blob> }[]>): ReturnType<typeof vi.fn> {
  const spy = vi.fn(read);
  Object.defineProperty(navigator, 'clipboard', { value: { read: spy }, configurable: true });
  return spy;
}

const offering = (...kinds: string[]): { types: string[]; getType: (kind: string) => Promise<Blob> } => ({ types: kinds, getType: async (kind) => new Blob([kind], { type: kind }) });

// Sends the draft, which also empties it: a chat's draft is kept in memory between mounts (ADR 0048).
async function send(view: Wrapper, text: string): Promise<void> {
  await view.find('[data-test="composer-text"]').setValue(text);
  await view.find('[data-test="send"]').trigger('click');
  await flushPromises();
}

function world(): { fake: FakeKvman; fetch: ReturnType<typeof vi.fn> } {
  const fake = createFakeKvman();
  serve(fake, { found: session(), messages: [user('go')], omitted: 0, turns: [turn()] });
  fake.handle('kvcoder.message.send', () => ({}));
  const fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true, file: { id: 'f1' } })));
  vi.stubGlobal('fetch', fetch);
  return { fake, fetch };
}

// A paste as the browser gives it: the clipboard's files and types, and whether the box stopped the browser's own paste.
async function paste(view: Wrapper, files: File[], types: string[] = files.length === 0 ? ['text/plain'] : ['Files']): Promise<boolean> {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { files, types } });
  view.find('[data-test="composer-text"]').element.dispatchEvent(event);
  await flushPromises();
  return event.defaultPrevented;
}

describe('pasting files into the send box (08 §8.7, ADR 0017, 13; ADR 0018, 6)', () => {
  it('QA24-H11 a pasted image is uploaded, shown as an attachment, and sent, and no text is pasted', async () => {
    const { fake, fetch } = world();
    const view = await mounted(ConversationView, fake, { sessionId: 's1' });
    expect(await paste(view, [new File(['png'], 'shot.png', { type: 'image/png' })])).toBe(true);
    expect(fetch).toHaveBeenCalledWith('/api/files?name=shot.png&workspaceId=home', expect.objectContaining({ method: 'POST', headers: { 'content-type': 'image/png' } }));
    expect(view.findAll('[data-test="attachment"]').map((chip) => chip.text())).toEqual(['shot.png']);
    await view.find('[data-test="composer-text"]').setValue('look');
    await view.find('[data-test="send"]').trigger('click');
    await flushPromises();
    expect(fake.calls).toContainEqual({ name: 'kvcoder.message.send', input: { sessionId: 's1', text: 'look', fileIds: ['f1'], sendId: expect.any(String) } });
    view.unmount();
  });

  it('QA25-H3 any pasted file is uploaded and sent, the attach button takes any file, and a paste without files is the browser\'s', async () => {
    const { fake, fetch } = world();
    const view = await mounted(ConversationView, fake, { sessionId: 's1' });
    expect(await paste(view, [new File(['pdf'], 'notes.pdf', { type: 'application/pdf' }), new File(['x'], 'Makefile')])).toBe(true);
    expect(fetch.mock.calls.map((call) => [call[0], (call[1] as { headers: Record<string, string> }).headers['content-type']])).toEqual([
      ['/api/files?name=notes.pdf&workspaceId=home', 'application/pdf'],
      ['/api/files?name=Makefile&workspaceId=home', 'application/octet-stream'],
    ]);
    expect(fake.toast).not.toHaveBeenCalled();
    expect(view.findAll('[data-test="attachment"]').map((chip) => chip.text())).toEqual(['notes.pdf', 'Makefile']);
    expect(view.find('[data-test="composer-files"]').attributes('accept')).toBeUndefined();
    expect(view.find('.kvc-composer-row button').attributes()).toMatchObject({ 'aria-label': 'Attach files', title: 'Attach files' });
    await view.find('[data-test="composer-text"]').setValue('read these');
    await view.find('[data-test="send"]').trigger('click');
    await flushPromises();
    expect(fake.calls).toContainEqual({ name: 'kvcoder.message.send', input: { sessionId: 's1', text: 'read these', fileIds: ['f1', 'f1'], sendId: expect.any(String) } });
    expect(await paste(view, [])).toBe(false);
    view.unmount();
  });

  it('M2.4-E267 an empty paste reads the clipboard and attaches its image as image.png', async () => {
    const { fake, fetch } = world();
    const read = clipboard(async () => [offering('image/png')]);
    const view = await mounted(ConversationView, fake, { sessionId: 's1' });
    expect(await paste(view, [], [])).toBe(false);
    expect(read).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('/api/files?name=image.png&workspaceId=home', expect.objectContaining({ method: 'POST', headers: { 'content-type': 'image/png' } }));
    expect(view.findAll('[data-test="attachment"]').map((chip) => chip.text())).toEqual(['image.png']);
    await send(view, 'look');
    expect(fake.calls).toContainEqual({ name: 'kvcoder.message.send', input: { sessionId: 's1', text: 'look', fileIds: ['f1'], sendId: expect.any(String) } });
    view.unmount();
  });

  it('M2.4-E268 a refused clipboard read shows a toast and attaches nothing', async () => {
    const { fake, fetch } = world();
    clipboard(async () => Promise.reject(new DOMException('refused', 'NotAllowedError')));
    const view = await mounted(ConversationView, fake, { sessionId: 's1' });
    await paste(view, [], []);
    expect(fake.toast).toHaveBeenCalledWith('kvcoder.ui.pasteFailed', {}, 'error');
    expect(fetch).not.toHaveBeenCalled();
    expect(view.findAll('[data-test="attachment"]')).toHaveLength(0);
    view.unmount();
  });

  it('M2.4-E269 a paste of text leaves the clipboard alone, and only PNG, JPEG, GIF, and WebP are taken, the first an item offers', async () => {
    const { fake, fetch } = world();
    const read = clipboard(async () => [offering('text/plain'), offering('image/svg+xml'), offering('image/webp', 'image/jpeg')]);
    const view = await mounted(ConversationView, fake, { sessionId: 's1' });
    expect(await paste(view, [], ['text/plain'])).toBe(false);
    expect(read).not.toHaveBeenCalled();
    await paste(view, [], []);
    expect(fetch.mock.calls.map((call) => call[0])).toEqual(['/api/files?name=image.jpeg&workspaceId=home']);
    expect(view.findAll('[data-test="attachment"]').map((chip) => chip.text())).toEqual(['image.jpeg']);
    await send(view, 'look');

    read.mockImplementation(async () => [offering('text/html')]);
    fetch.mockClear();
    await paste(view, [], []);
    expect(fetch).not.toHaveBeenCalled();
    expect(fake.toast).not.toHaveBeenCalled();
    view.unmount();
  });
});
