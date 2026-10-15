import { describe, expect, it } from 'vitest';
import { ProblemError } from '@kvman/sdk';
import ConversationView from '../../web/src/ConversationView.vue';
import { createFakeKvman, type FakeKvman } from './support/fake-kvman.ts';
import { mounted, session } from './support/fixtures.ts';

// A chat the tab's workspace doesn't have: every read of `s1` fails `kvcoder/SESSION_NOT_FOUND`, as the kernel answers
// for a chat of another workspace (08 §8.7, ADR 0082, 5).
function elsewhere(newest: string | undefined, artifactCode = 'kvcoder/SESSION_NOT_FOUND'): FakeKvman {
  const fake = createFakeKvman();
  const missing = (code: string) => () => {
    throw new ProblemError({ code, message: 'No such chat.', params: { sessionId: 's1' } });
  };
  for (const name of ['kvcoder.session.get', 'kvcoder.message.list', 'kvcoder.turn.list', 'kvcoder.context.get', 'kvcoder.job.list']) fake.handle(name, missing('kvcoder/SESSION_NOT_FOUND'));
  fake.handle('kvcoder.artifact.list', missing(artifactCode));
  fake.handle('kvcoder.map.get', missing('kvcoder/SESSION_NOT_FOUND'));
  fake.handle('kvcoder.session.list', () => (newest === undefined ? [] : [session({ id: newest })]));
  fake.handle('kvcoder.slash.list', () => []);
  fake.handle('kernel.settings.list', () => []);
  return fake;
}

const toasts = (fake: FakeKvman, text: string) => fake.toast.mock.calls.filter((call) => call[0] === text).length;

describe('a chat from another workspace (08 §8.7, ADR 0082, 5)', () => {
  it("QA52-H5 one notice, then the workspace's newest chat, or the Chat page when it has none", async () => {
    const withNewest = elsewhere('s7');
    const view = await mounted(ConversationView, withNewest, { sessionId: 's1' });
    expect(toasts(withNewest, 'kvcoder.ui.chatNotHere')).toBe(1);
    expect(withNewest.navigate).toHaveBeenCalledWith('kvcoder.session', { sessionId: 's7' });
    view.unmount();

    const empty = elsewhere(undefined);
    const emptyView = await mounted(ConversationView, empty, { sessionId: 's1' });
    expect(toasts(empty, 'kvcoder.ui.chatNotHere')).toBe(1);
    expect(empty.navigate).toHaveBeenCalledWith('kvcoder.chat');
    emptyView.unmount();
  });

  it('QA52-E6 later failures for the same chat show nothing, and a failure of another code still shows its own', async () => {
    const fake = elsewhere('s7', 'kvcoder/OTHER');
    const view = await mounted(ConversationView, fake, { sessionId: 's1' });
    expect(toasts(fake, 'kvcoder.ui.chatNotHere')).toBe(1);
    expect(toasts(fake, 'kvcoder.errors.SESSION_NOT_FOUND')).toBe(0);
    expect(toasts(fake, 'kvcoder.errors.OTHER')).toBe(1);
    view.unmount();
  });
});
