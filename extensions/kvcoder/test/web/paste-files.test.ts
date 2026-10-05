import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ConversationView from '../../web/src/ConversationView.vue';
import { createFakeKvman, type FakeKvman } from './support/fake-kvman.ts';
import { mounted, serve, session, turn, user } from './support/fixtures.ts';

type Wrapper = Awaited<ReturnType<typeof mounted>>;

afterEach(() => {
  vi.unstubAllGlobals();
});

function world(): { fake: FakeKvman; fetch: ReturnType<typeof vi.fn> } {
  const fake = createFakeKvman();
  serve(fake, { found: session(), messages: [user('go')], omitted: 0, turns: [turn()] });
  fake.handle('kvcoder.message.send', () => ({}));
  const fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true, file: { id: 'f1' } })));
  vi.stubGlobal('fetch', fetch);
  return { fake, fetch };
}

// A paste as the browser gives it: the clipboard's files, and whether the box stopped the browser's own paste.
async function paste(view: Wrapper, files: File[]): Promise<boolean> {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { files } });
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
    expect(fake.calls).toContainEqual({ name: 'kvcoder.message.send', input: { sessionId: 's1', text: 'look', fileIds: ['f1'] } });
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
    expect(fake.calls).toContainEqual({ name: 'kvcoder.message.send', input: { sessionId: 's1', text: 'read these', fileIds: ['f1', 'f1'] } });
    expect(await paste(view, [])).toBe(false);
    view.unmount();
  });
});
