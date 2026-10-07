import { describe, expect, it } from 'vitest';
import ConversationView from '../../web/src/ConversationView.vue';
import { createFakeKvman } from './support/fake-kvman.ts';
import { answer, message, mounted, serve, session, turn, user } from './support/fixtures.ts';

const call = { type: 'toolCall', id: 'c1', name: 'run', arguments: { description: 'Reading the file', connector: 'fs', command: 'read', payload: { path: 'a.txt' } } };
const result = () => message('toolResult', { role: 'toolResult', toolCallId: 'c1', toolName: 'run', content: [{ type: 'text', text: '{"path":"a.txt"}' }], isError: false, details: { description: 'Reading the file', connector: 'fs', command: 'read' } }, { turnId: 't1' });

// The page's parts in the order a person reads them.
const order = (wrapper: Awaited<ReturnType<typeof mounted>>): string[] =>
  wrapper.findAll('[data-test="call-card"], [data-test="turn-totals"], [data-test="notice"], [data-test="markdown"]').map((node) => node.attributes('data-test') ?? '');

describe("a turn's totals and a message's attached files (08 §8.7, ADR 0035, 1 and 2)", () => {
  it("QA47-H2 a stopped turn's totals come after its last call's card and before the notice", async () => {
    const fake = createFakeKvman();
    const messages = [user('go'), answer('Looking.', { turnId: 't1' }), message('assistant', { role: 'assistant', content: [call] }, { turnId: 't1' }), result(), message('notice', { code: 'CANCELLED', params: {} }, { turnId: 't1' })];
    serve(fake, { found: session(), messages, omitted: 0, turns: [turn({ outcome: 'cancelled', endedAt: '2026-10-01T09:01:00.000Z' })] });
    const wrapper = await mounted(ConversationView, fake, { sessionId: 's1' });
    expect(order(wrapper)).toEqual(['markdown', 'call-card', 'turn-totals', 'notice']);
  });

  it('QA47-E1 a turn that ended on an answer has its totals right under the answer', async () => {
    const fake = createFakeKvman();
    const messages = [user('go'), message('assistant', { role: 'assistant', content: [call] }, { turnId: 't1' }), result(), answer('Done.', { turnId: 't1' })];
    serve(fake, { found: session(), messages, omitted: 0, turns: [turn({ outcome: 'done', endedAt: '2026-10-01T09:01:00.000Z' })] });
    const wrapper = await mounted(ConversationView, fake, { sessionId: 's1' });
    expect(order(wrapper)).toEqual(['call-card', 'markdown', 'turn-totals']);
  });

  it("QA47-H3 the line above a message's attached files is in the page's language", async () => {
    const fake = createFakeKvman();
    serve(fake, { found: session(), messages: [user('Fix it\n\nAttached files:\n- attachments/a.docx\n- attachments/b.md')], omitted: 0, turns: [] });
    const english = await mounted(ConversationView, fake, { sessionId: 's1' });
    expect(english.find('[data-test="user-message"] span').element.textContent).toBe('Fix it\n\nAttached files:\n- attachments/a.docx\n- attachments/b.md');
    fake.language.value = 'ar';
    const arabic = await mounted(ConversationView, fake, { sessionId: 's1' });
    expect(arabic.find('[data-test="user-message"] span').element.textContent).toBe('Fix it\n\nالملفات المرفقة:\n- attachments/a.docx\n- attachments/b.md');
  });

  it('QA47-E2 the words in the middle of a message, with no list at its end, are shown as they are', async () => {
    const fake = createFakeKvman();
    fake.language.value = 'ar';
    const text = 'What does this mean?\n\nAttached files:\nnothing follows';
    serve(fake, { found: session(), messages: [user(text)], omitted: 0, turns: [] });
    const wrapper = await mounted(ConversationView, fake, { sessionId: 's1' });
    expect(wrapper.find('[data-test="user-message"] span').element.textContent).toBe(text);
  });
});
