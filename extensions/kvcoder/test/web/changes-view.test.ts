import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ConversationView from '../../web/src/ConversationView.vue';
import { createFakeKvman } from './support/fake-kvman.ts';
import { mounted, serve, session, turn, user } from './support/fixtures.ts';

// The Changes view (08 §8.7, ADR 0093, 2).
const files = [
  { path: 'src/app.ts', added: 1, removed: 1, diff: '--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1 +1 @@\n-one\n+two', state: 'changed' as const },
  { path: 'notes.md', added: 2, removed: 0, diff: '--- a/notes.md\n+++ b/notes.md\n@@ -0,0 +1,2 @@\n+a\n+b', state: 'created' as const },
];

async function chat() {
  const fake = createFakeKvman();
  serve(fake, { found: session(), messages: [user('go')], omitted: 0, turns: [turn({ outcome: 'done', endedAt: '2026-10-01T09:01:00.000Z' })] });
  fake.handle('kvcoder.change.list', (input) => ({ files: input['withDiffs'] === false ? files.map((file) => ({ ...file, added: 0, removed: 0, diff: '' })) : files, diffs: true }));
  fake.handle('kvcoder.change.undo', () => ({}));
  fake.handle('kvcoder.message.send', () => ({}));
  const view = await mounted(ConversationView, fake, { sessionId: 's1' });
  return { fake, view };
}

describe('the Changes view (ADR 0093, 2)', () => {
  it('QA61-H6 the header counts the changes, the panel lists them, a press shows a diff, Undo and Commit act', async () => {
    const { fake, view } = await chat();
    const toggle = view.find('[data-test="changes-toggle"]');
    expect(toggle.text()).toBe('2');
    expect(toggle.attributes('aria-label')).toBe('Changes (2)');
    await toggle.trigger('click');
    await flushPromises();
    expect(view.find('[data-test="artifact-title"]').text()).toBe('Changes');
    const rows = view.findAll('[data-test="change-file"]');
    expect(rows.map((row) => [row.find('[data-test="change-path"]').text(), row.find('[data-test="change-counts"]').text(), row.find('[data-test="change-state"]').text()])).toEqual([['src/app.ts', '+1 −1', 'Changed'], ['notes.md', '+2 −0', 'New']]);
    await rows[0]?.find('[data-test="change-open"]').trigger('click');
    expect(view.findAll('[data-test="change-diff"] span').map((line) => line.attributes('data-kind'))).toEqual(['head', 'head', 'hunk', 'removed', 'added']);
    await rows[0]?.find('[data-test="change-undo"]').trigger('click');
    await flushPromises();
    expect(fake.calls.filter((call) => call.name === 'kvcoder.change.undo').map((call) => call.input)).toEqual([{ sessionId: 's1', path: 'src/app.ts' }]);
    await view.find('[data-test="changes-commit"]').trigger('click');
    await flushPromises();
    expect(fake.calls.filter((call) => call.name === 'kvcoder.message.send').map((call) => call.input['text'])).toEqual(['Commit these changes.']);
    await view.find('[data-test="artifact-close"]').trigger('click');
    expect(view.find('[data-test="changes"]').exists()).toBe(false);
  });

  it("QA67-H18 the panel shows this turn's files first, Whole chat asks for all, and the header counts the whole chat", async () => {
    const { fake, view } = await chat();
    await view.find('[data-test="changes-toggle"]').trigger('click');
    await flushPromises();
    const lists = () => fake.calls.filter((call) => call.name === 'kvcoder.change.list' && call.input['withDiffs'] !== false).map((call) => call.input['scope']);
    expect(lists()).toEqual(['turn']);
    expect(view.find('[data-test="changes-scope-turn"]').attributes('aria-pressed')).toBe('true');
    await view.find('[data-test="changes-scope-chat"]').trigger('click');
    await flushPromises();
    expect(lists()).toEqual(['turn', 'chat']);
    expect(view.find('[data-test="changes-scope-chat"]').attributes('aria-pressed')).toBe('true');
    expect(fake.calls.filter((call) => call.name === 'kvcoder.change.list' && call.input['withDiffs'] === false).every((call) => call.input['scope'] === undefined)).toBe(true);
    expect(view.find('[data-test="changes-toggle"]').text()).toBe('2');
  });
});

