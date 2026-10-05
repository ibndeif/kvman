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

describe('pasting files into the send box (08 §8.7, ADR 0017, 13)', () => {
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

  it("QA24-E9 a pasted file that isn't an image isn't uploaded and says why, and a paste without files is the browser's", async () => {
    const { fake, fetch } = world();
    const view = await mounted(ConversationView, fake, { sessionId: 's1' });
    expect(await paste(view, [new File(['pdf'], 'notes.pdf', { type: 'application/pdf' })])).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
    expect(fake.toast.mock.calls).toEqual([['kvcoder.ui.imagesOnly', { name: 'notes.pdf' }, 'error']]);
    expect(fake.kvman.t('kvcoder.ui.imagesOnly', { name: 'notes.pdf' })).toBe('Only images can be attached: notes.pdf');
    expect(view.find('[data-test="attachment"]').exists()).toBe(false);
    expect(await paste(view, [])).toBe(false);
    view.unmount();
  });
});
