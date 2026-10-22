import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import MessageComposer from '../../web/src/MessageComposer.vue';
import { messageDraft } from '../../web/src/message-drafts.ts';
import { createFakeKvman } from './support/fake-kvman.ts';
import { mounted } from './support/fixtures.ts';

// Text the host inserts goes to the open composer (08 §8.7, ADR 0100, 19), such as VS Code's "Add to kvman chat".
const composer = (fake: ReturnType<typeof createFakeKvman>, sessionId?: string) => mounted(MessageComposer, fake, { ...(sessionId === undefined ? {} : { sessionId }), stoppable: false, placeholder: 'Describe a change' });

describe('inserted text in the composer (08 §8.7, ADR 0100, 19)', () => {
  it('M4.5-H5 the text goes on a line of its own, in a chat and on a new chat, and the box takes the focus', async () => {
    const fake = createFakeKvman();
    const draft = messageDraft('home', 'insert-chat');
    draft.text = 'look at';
    const view = await composer(fake, 'insert-chat');
    document.body.append(view.element);
    fake.host.insert('`src/a.ts:3`');
    await flushPromises();
    expect(draft.text).toBe('look at\n`src/a.ts:3`\n');
    expect(document.activeElement).toBe(view.find('[data-test="composer-text"]').element);
    view.unmount();

    const fresh = await composer(fake);
    fake.host.insert('`src/b.ts`');
    await flushPromises();
    expect(messageDraft('home', undefined).text).toBe('`src/b.ts`\n');
    fresh.unmount();
  });

  it('M4.5-E4 a composer that is gone takes no text', async () => {
    const fake = createFakeKvman();
    const view = await composer(fake, 'gone-chat');
    view.unmount();
    expect(fake.host.handlers()).toBe(0);
    fake.host.insert('late');
    expect(messageDraft('home', 'gone-chat').text).toBe('');
  });
});
