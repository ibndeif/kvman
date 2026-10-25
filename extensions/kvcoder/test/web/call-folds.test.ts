import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import type { Message } from '../../src/index.ts';
import ConversationView from '../../web/src/ConversationView.vue';
import { createFakeKvman } from './support/fake-kvman.ts';
import { answer, message, mounted, serve, session, turn, user } from './support/fixtures.ts';

// A turn as a story (08 §8.7, ADR 0093, 1): calls in a row fold into one row; the final answer is marked.
let ids = 0;
function called(connector: string, command: string, payload: Message['content'], result: { text: string; isError?: boolean; durationMs?: number; details?: Record<string, unknown> }, turnId = 't1', thinking?: string): Message[] {
  ids += 1;
  const id = `c${ids}`;
  const said = thinking === undefined ? [] : [{ type: 'thinking', thinking }];
  return [
    message('assistant', { role: 'assistant', content: [...said, { type: 'toolCall', id, name: 'run', arguments: { connector, command, payload } }] }, { turnId, durationMs: 1000 }),
    message('toolResult', { role: 'toolResult', toolCallId: id, toolName: 'run', content: [{ type: 'text', text: result.text }], isError: result.isError === true, details: { connector, command, durationMs: result.durationMs ?? 500, ...result.details } }, { turnId }),
  ];
}
const read = (path: string) => called('fs', 'read', { path }, { text: JSON.stringify({ path, fromLine: 1, totalLines: 1, content: 'a\n' }) });
const search = () => called('fs', 'search', { pattern: 'x' }, { text: JSON.stringify({ files: [], truncated: false }) });
const readFiles = (...paths: string[]) => called('fs', 'read-files', { files: paths.map((path) => ({ path })) }, { text: 'read' });
const edit = (path: string) => called('fs', 'edit', { path, edits: [{ oldText: 'a', newText: 'b' }], risky: false }, { text: JSON.stringify({ path, replacements: 1, firstChangedLine: 1, fromLine: 1, content: 'b' }) });
const ran = (line: string, exit = 0) => called('shell', 'exec', { line, risky: false }, { text: `out\n[exit code ${exit}]`, isError: exit !== 0 });
// A line that couldn't finish keeps its failure look; one that exited with another code reads calmly (ADR 0102, 15).
const timedOut = (line: string) => called('shell', 'exec', { line, risky: false }, { text: 'out\n[timed out after 120 s; the process tree was killed]\n[exit code 124]', isError: true, details: { exitCode: 124, timedOut: true } });
const thought = (headline: string | undefined, path: string, rest = 'Looking at it.') => called('fs', 'read', { path }, { text: JSON.stringify({ path, fromLine: 1, totalLines: 1, content: 'a\n' }) }, 't1', headline === undefined ? rest : `**${headline}**\n\n${rest}`);

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
    const failed = await shown([user('go', { turnId: 't1' }), ...read('a.ts'), ...timedOut('pnpm test')]);
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
    const view = await shown([user('go', { turnId: 't1' }), ...edit('a.ts'), ...timedOut('pnpm test')]);
    expect(view.find('[data-test="call-fold-words"]').text()).toBe('Changed 1 file, ran 1 command');
    expect(view.find('[data-test="call-fold-failed"]').text()).toBe('· 1 failed');
    expect(view.find('[data-test="call-fold-failed"]').classes()).toContain('kvc-fold-failed');
    expect(view.find('[data-test="call-fold-words"]').element.parentElement?.classList.contains('kvc-fold-words')).toBe(true);
  });

  it('QA66-H7 an Arabic fold reads as an Arabic sentence', async () => {
    const view = await shown([user('go', { turnId: 't1' }), ...read('a.ts'), ...read('b.ts'), ...search(), ...timedOut('pnpm test')], { language: 'ar' });
    expect(view.find('[data-test="call-fold-words"]').text()).toBe('قراءة ملفين، بحث مرة واحدة، تشغيل أمر واحد');
    expect(view.find('[data-test="call-fold-failed"]').text()).toBe('· فشلت خطوة واحدة');
  });

  // QA67-H25: lines that exited with another code aren't failures (ADR 0102, 15).
  it("QA66-E4 QA67-H25 a fold of failures counts each; the agent's own invalid request and a line that exited aren't one", async () => {
    const invalidEdit = called('fs', 'edit', { path: 'a.ts' }, { text: 'error VALIDATION_FAILED: edits: Required.', isError: true });
    const calm = await shown([user('go', { turnId: 't1' }), ...ran('pnpm test', 1), ...ran('pnpm lint', 2), ...invalidEdit]);
    expect(calm.find('[data-test="call-fold-words"]').text()).toBe('Changed 1 file, ran 2 commands');
    expect(calm.find('[data-test="call-fold-failed"]').exists()).toBe(false);
    const view = await shown([user('go', { turnId: 't1' }), ...timedOut('pnpm test'), ...timedOut('pnpm lint'), ...invalidEdit]);
    expect(view.find('[data-test="call-fold-failed"]').text()).toBe('· 2 failed');
  });
});

describe('step headlines (08 §8.7, ADR 0102, 1)', () => {
  const rows = (view: Awaited<ReturnType<typeof mounted>>) => view.findAll('[data-test="headline-text"], [data-test="call-fold"], [data-test="call-card"], [data-test="assistant-message"]').map((row) => row.attributes('data-test') === 'headline-text' ? `headline:${row.text()}` : row.attributes('data-test') ?? '');

  it('QA67-H1 a headline is a line, the calls under it fold, and replies that share it join', async () => {
    const view = await shown([user('go', { turnId: 't1' }), ...thought('Reading the importer', 'a.ts'), ...thought('Reading the importer', 'b.ts'), ...thought('Fixing the path check', 'c.ts')]);
    expect(rows(view)).toEqual(['headline:Reading the importer', 'call-fold', 'headline:Fixing the path check', 'call-card']);
    expect(view.find('[data-test="call-fold-words"]').text()).toBe('Read 2 files');
    expect(view.find('[data-test="headline-thinking"]').text()).toBe('**Reading the importer**\n\nLooking at it.\n\n**Reading the importer**\n\nLooking at it.');
  });

  it('QA67-H2 replies whose thinking has no headline no longer break a fold', async () => {
    const view = await shown([user('go', { turnId: 't1' }), ...thought(undefined, 'a.ts'), ...thought(undefined, 'b.ts'), ...thought(undefined, 'c.ts'), ...thought(undefined, 'd.ts')]);
    expect(rows(view)).toEqual(['call-fold']);
    expect(view.find('[data-test="call-fold-words"]').text()).toBe('Read 4 files');
  });

  it('QA67-E1 a bold word inside a line is no headline', async () => {
    const view = await shown([user('go', { turnId: 't1' }), ...thought(undefined, 'a.ts', 'I think **this** matters'), ...thought(undefined, 'b.ts')]);
    expect(view.find('[data-test="headline"]').exists()).toBe(false);
  });

  it('QA67-E2 and QA67-E3 a reply with text ends the group, and a first group may have no headline', async () => {
    const view = await shown([user('go', { turnId: 't1' }), ...thought(undefined, 'a.ts'), ...thought(undefined, 'b.ts'), answer('Found it.', { turnId: 't1' }), ...thought('Fixing it', 'c.ts'), ...thought('Fixing it', 'd.ts')]);
    expect(rows(view)).toEqual(['call-fold', 'assistant-message', 'headline:Fixing it', 'call-fold']);
  });
});
