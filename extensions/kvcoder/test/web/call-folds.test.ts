import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import type { Message } from '../../src/index.ts';
import ConversationView from '../../web/src/ConversationView.vue';
import { createFakeKvman } from './support/fake-kvman.ts';
import { answer, message, mounted, serve, session, turn, user } from './support/fixtures.ts';

// A turn as a story (08 §8.7, ADR 0093, 1): calls in a row fold into one row; the final answer is marked.
let ids = 0;
function called(connector: string, command: string, payload: Message['content'], result: { text: string; isError?: boolean; durationMs?: number }, turnId = 't1'): Message[] {
  ids += 1;
  const id = `c${ids}`;
  return [
    message('assistant', { role: 'assistant', content: [{ type: 'toolCall', id, name: 'run', arguments: { connector, command, payload } }] }, { turnId, durationMs: 1000 }),
    message('toolResult', { role: 'toolResult', toolCallId: id, toolName: 'run', content: [{ type: 'text', text: result.text }], isError: result.isError === true, details: { connector, command, durationMs: result.durationMs ?? 500 } }, { turnId }),
  ];
}
const read = (path: string) => called('fs', 'read', { path }, { text: JSON.stringify({ path, fromLine: 1, totalLines: 1, content: 'a\n' }) });
const search = () => called('fs', 'search', { pattern: 'x' }, { text: JSON.stringify({ files: [], truncated: false }) });
const readFiles = (...paths: string[]) => called('fs', 'read-files', { files: paths.map((path) => ({ path })) }, { text: 'read' });
const edit = (path: string) => called('fs', 'edit', { path, edits: [{ oldText: 'a', newText: 'b' }], risky: false }, { text: JSON.stringify({ path, replacements: 1, firstChangedLine: 1, fromLine: 1, content: 'b' }) });
const ran = (line: string, exit = 0) => called('shell', 'exec', { line, risky: false }, { text: `out\n[exit code ${exit}]`, isError: exit !== 0 });

async function shown(messages: Message[], fields: { status?: 'idle' | 'running'; outcome?: boolean; language?: 'en' | 'ar' } = {}) {
  const fake = createFakeKvman();
  fake.language.value = fields.language ?? 'en';
  const done = fields.outcome === false ? {} : { outcome: 'done' as const, endedAt: '2026-10-01T09:01:00.000Z' };
  serve(fake, { found: session({ status: fields.status ?? 'idle' }), messages, omitted: 0, turns: [turn(done)] });
  return mounted(ConversationView, fake, { sessionId: 's1' });
}
const folds = (view: Awaited<ReturnType<typeof mounted>>) => view.findAll('[data-test="call-fold"]');

describe('calls folded between the agent\'s text (ADR 0093, 1)', () => {
  it('QA61-H1 and QA66-H4 calls in a row are one closed row that says what they did as a sentence and how long, and opens with a press', async () => {
    const view = await shown([user('go', { turnId: 't1' }), answer('Looking first.', { turnId: 't1' }), ...read('a.ts'), ...read('b.ts'), ...search(), ...ran('pnpm test'), answer('All done.', { turnId: 't1' })]);
    expect(folds(view)).toHaveLength(1);
    expect(view.find('[data-test="call-fold-words"]').text()).toBe('Read 2 files, ran 1 search, ran 1 command');
    expect(view.find('[data-test="call-fold-time"]').text()).toBe('6.0 s');
    expect(view.find('[data-test="call-fold-body"]').exists()).toBe(false);
    await view.find('[data-test="call-fold-head"]').trigger('click');
    expect(view.findAll('[data-test="call-fold-body"] [data-test="call-card"]')).toHaveLength(4);
  });

  it('QA61-H3 the last text of an ended turn is marked, not earlier text or a running turn\'s', async () => {
    const ended = await shown([user('go', { turnId: 't1' }), answer('Looking first.', { turnId: 't1' }), ...read('a.ts'), answer('All done.', { turnId: 't1' })]);
    expect(ended.findAll('[data-test="assistant-message"]').map((found) => found.attributes('data-final') ?? 'no')).toEqual(['no', 'true']);
    const running = await shown([user('go', { turnId: 't1' }), answer('Working on it.', { turnId: 't1' })], { status: 'running', outcome: false });
    expect(running.find('[data-test="assistant-message"]').attributes('data-final')).toBeUndefined();
  });

  it('QA61-E1 a single call, an answered question, and a notice stay as they are, and a fold stops at each', async () => {
    const view = await shown([user('go', { turnId: 't1' }), ...read('a.ts'), message('notice', { code: 'CANCELLED', params: {} }), ...read('b.ts'), ...read('c.ts'), answer('Done.', { turnId: 't1' }), ...ran('ls')]);
    expect(folds(view)).toHaveLength(1);
    expect(view.findAll('.kvc-column > [data-test="call-card"]')).toHaveLength(2);
  });

  it('QA61-E2 a fold with a failure starts open, one with only an invalid request does not, and the running turn\'s is open', async () => {
    const failed = await shown([user('go', { turnId: 't1' }), ...read('a.ts'), ...ran('pnpm test', 1)]);
    expect(failed.find('[data-test="call-fold-body"]').exists()).toBe(true);
    expect(failed.find('[data-test="call-fold-words"]').text()).toBe('Read 1 file, ran 1 command');
    expect(failed.find('[data-test="call-fold-failed"]').text()).toBe('· 1 failed');
    const invalid = await shown([user('go', { turnId: 't1' }), ...read('a.ts'), ...called('fs', 'read', {}, { text: 'error VALIDATION_FAILED: path: Required.', isError: true })]);
    expect(invalid.find('[data-test="call-fold-body"]').exists()).toBe(false);
    const running = await shown([user('go', { turnId: 't1' }), ...read('a.ts'), ...read('b.ts')], { status: 'running', outcome: false });
    await flushPromises();
    expect(running.find('[data-test="call-fold-body"]').exists()).toBe(true);
  });

  it("QA61-E3 a turn's line follows the fold that holds its last message", async () => {
    const view = await shown([user('go', { turnId: 't1' }), ...read('a.ts'), ...read('b.ts')]);
    const html = view.html();
    expect(view.find('[data-test="turn-totals"]').exists()).toBe(true);
    expect(html.indexOf('data-test="call-fold"')).toBeLessThan(html.indexOf('data-test="turn-totals"'));
  });

  it('QA66-H5 files are counted once each, and read-files is a read', async () => {
    const view = await shown([user('go', { turnId: 't1' }), ...readFiles('a.ts', 'b.ts'), ...read('a.ts'), ...edit('a.ts'), ...edit('a.ts')]);
    expect(view.find('[data-test="call-fold-words"]').text()).toBe('Read 2 files, changed 1 file');
  });

  it('QA66-H6 failures follow the words in the danger color, and the words start at the inline start', async () => {
    const view = await shown([user('go', { turnId: 't1' }), ...edit('a.ts'), ...ran('pnpm test', 1)]);
    expect(view.find('[data-test="call-fold-words"]').text()).toBe('Changed 1 file, ran 1 command');
    expect(view.find('[data-test="call-fold-failed"]').text()).toBe('· 1 failed');
    expect(view.find('[data-test="call-fold-failed"]').classes()).toContain('kvc-fold-failed');
    expect(view.find('[data-test="call-fold-words"]').element.parentElement?.classList.contains('kvc-fold-words')).toBe(true);
  });

  it('QA66-H7 an Arabic fold reads as an Arabic sentence', async () => {
    const view = await shown([user('go', { turnId: 't1' }), ...read('a.ts'), ...read('b.ts'), ...search(), ...ran('pnpm test', 1)], { language: 'ar' });
    expect(view.find('[data-test="call-fold-words"]').text()).toBe('قراءة ملفين، بحث مرة واحدة، تشغيل أمر واحد');
    expect(view.find('[data-test="call-fold-failed"]').text()).toBe('· فشلت خطوة واحدة');
  });

  it("QA66-E4 a fold of failures counts each, and the agent's own invalid request isn't one", async () => {
    const invalidEdit = called('fs', 'edit', { path: 'a.ts' }, { text: 'error VALIDATION_FAILED: edits: Required.', isError: true });
    const view = await shown([user('go', { turnId: 't1' }), ...ran('pnpm test', 1), ...ran('pnpm lint', 2), ...invalidEdit]);
    expect(view.find('[data-test="call-fold-words"]').text()).toBe('Changed 1 file, ran 2 commands');
    expect(view.find('[data-test="call-fold-failed"]').text()).toBe('· 2 failed');
  });
});
