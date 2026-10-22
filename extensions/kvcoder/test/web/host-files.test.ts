import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { ProblemError } from '@kvman/sdk';
import ApprovalsCard from '../../web/src/ApprovalsCard.vue';
import CallCard from '../../web/src/CallCard.vue';
import ChangesView from '../../web/src/ChangesView.vue';
import { callView } from '../../web/src/call-view.ts';
import { absolutePath } from '../../web/src/host-files.ts';
import { createFakeKvman, type FakeKvman } from './support/fake-kvman.ts';
import { mounted } from './support/fixtures.ts';

// Files in a host that embeds kvwebui (08 §8.7, ADR 0100, 17 and 18): paths open in its editor, and an edit or a write
// has "Open diff". The fake's workspace is /work/notes-app.

const fs = (command: string, payload: Record<string, unknown>) => callView({ connector: 'fs', command, payload });
const edit = fs('edit', { path: 'src/a.ts', edits: [{ oldText: 'old', newText: 'new', replaceAll: true }] });

function embedded(on = true): FakeKvman {
  const fake = createFakeKvman();
  fake.host.embedded = on;
  return fake;
}

async function opened(fake: FakeKvman, view: ReturnType<typeof callView>, output: unknown) {
  const card = await mounted(CallCard, fake, { view, output: JSON.stringify(output), durationMs: 10 });
  await card.find('button').trigger('click');
  return card;
}

describe('files in a host (08 §8.7, ADR 0100, 17 and 18)', () => {
  it('M4.5-H3 Open diff asks the preview on an approval, and the Git change on a card that ran', async () => {
    const fake = embedded();
    fake.handle('kvcoder.file.preview.get', () => ({ path: '/work/notes-app/src/a.ts', after: 'new text' }));
    const approval = await mounted(ApprovalsCard, fake, { approvals: [{ questionId: 'q1', view: edit }] });
    await approval.find('[data-test="open-diff"]').trigger('click');
    await flushPromises();
    expect(fake.calls.find((call) => call.name === 'kvcoder.file.preview.get')?.input).toEqual({ path: 'src/a.ts', edits: [{ oldText: 'old', newText: 'new', replaceAll: true }] });
    expect(fake.host.openDiff.mock.calls).toEqual([['a.ts (proposed)', '/work/notes-app/src/a.ts', 'new text']]);
    const card = await opened(fake, edit, { path: 'src/a.ts', replacements: 1, firstChangedLine: 7, fromLine: 4, content: 'x' });
    await card.find('[data-test="open-diff"]').trigger('click');
    expect(fake.host.openChange.mock.calls).toEqual([['/work/notes-app/src/a.ts']]);
  });

  it('M4.5-H4 paths open in the host at their lines, and a listed folder is no link', async () => {
    const fake = embedded();
    const read = await opened(fake, fs('read', { path: 'src/a.ts' }), { path: 'src/a.ts', fromLine: 24, totalLines: 90, content: 'x\n', truncated: false });
    await read.find('[data-test="open-file"]').trigger('click');
    const edited = await opened(fake, edit, { path: 'src/a.ts', replacements: 1, firstChangedLine: 7, fromLine: 4, content: 'x' });
    await edited.find('[data-test="open-file"]').trigger('click');
    const written = await opened(fake, fs('write', { path: '/abs/new.ts', content: 'y' }), { path: '/abs/new.ts', bytes: 1 });
    await written.find('[data-test="open-file"]').trigger('click');
    const readFiles = await opened(fake, fs('read-files', { paths: ['b.ts'] }), { files: [{ path: 'b.ts', fromLine: 3, totalLines: 9, content: 'z\n', truncated: false }] });
    await readFiles.find('[data-test="host-path"]').trigger('click');
    const found = await opened(fake, fs('find', { pattern: '*.ts' }), { paths: ['lib/c.ts'], truncated: false });
    await found.find('[data-test="host-path"]').trigger('click');
    const listed = await opened(fake, fs('list', { path: 'src/' }), { entries: [{ name: 'deep', kind: 'folder', bytes: 0 }, { name: 'd.ts', kind: 'file', bytes: 5 }], truncated: false });
    expect(listed.findAll('[data-test="host-path"]').map((link) => link.text())).toEqual(['d.ts']);
    await listed.find('[data-test="host-path"]').trigger('click');
    const searched = await opened(fake, fs('search', { pattern: 'todo' }), { files: [{ path: 'e.ts', matches: [{ line: 11, text: 'before', context: true }, { line: 12, text: 'todo', context: false }] }], truncated: false });
    await searched.find('[data-test="host-path"]').trigger('click');
    const changes = await mounted(ChangesView, fake, { sessionId: 's1', list: { files: [{ path: 'f.ts', added: 1, removed: 0, diff: '', state: 'changed' }, { path: 'gone.ts', added: 0, removed: 3, diff: '', state: 'deleted' }], diffs: true } });
    expect(changes.findAll('[data-test="change-open-file"]')).toHaveLength(1);
    await changes.find('[data-test="change-open-file"]').trigger('click');
    expect(fake.host.openFile.mock.calls).toEqual([
      ['/work/notes-app/src/a.ts', 24],
      ['/work/notes-app/src/a.ts', 7],
      ['/abs/new.ts', undefined],
      ['/work/notes-app/b.ts', 3],
      ['/work/notes-app/lib/c.ts', undefined],
      ['/work/notes-app/src/d.ts', undefined],
      ['/work/notes-app/e.ts', 12],
      ['/work/notes-app/f.ts'],
    ]);
  });

  it('M4.5-E2 outside embedded mode there is no Open diff and no path link', async () => {
    const fake = embedded(false);
    const approval = await mounted(ApprovalsCard, fake, { approvals: [{ questionId: 'q1', view: edit }] });
    const card = await opened(fake, fs('find', { pattern: '*.ts' }), { paths: ['lib/c.ts'], truncated: false });
    const changes = await mounted(ChangesView, fake, { sessionId: 's1', list: { files: [{ path: 'f.ts', added: 1, removed: 0, diff: '', state: 'changed' }], diffs: true } });
    for (const shown of [approval, card, changes]) {
      expect(shown.find('[data-test="file-actions"]').exists()).toBe(false);
      expect(shown.find('[data-test="host-path"]').exists()).toBe(false);
      expect(shown.find('[data-test="change-open-file"]').exists()).toBe(false);
    }
    expect([fake.host.openFile, fake.host.openDiff, fake.host.openChange].map((spy) => spy.mock.calls.length)).toEqual([0, 0, 0]);
  });

  it('M4.5-E3 a preview that fails is toasted, and no diff opens', async () => {
    const fake = embedded();
    fake.handle('kvcoder.file.preview.get', () => {
      throw new ProblemError({ code: 'VALIDATION_FAILED', message: 'x', params: {} });
    });
    const approval = await mounted(ApprovalsCard, fake, { approvals: [{ questionId: 'q1', view: edit }] });
    await approval.find('[data-test="open-diff"]').trigger('click');
    await flushPromises();
    expect(fake.toast.mock.calls.at(-1)?.[2]).toBe('error');
    expect(fake.host.openDiff).not.toHaveBeenCalled();
  });

  it('M4.5-H4 a workspace path is made absolute, and an absolute one stays', () => {
    expect(absolutePath('/work/app/', './src/a.ts')).toBe('/work/app/src/a.ts');
    expect(absolutePath('C:\\work\\app', 'src/a.ts')).toBe('C:\\work\\app/src/a.ts');
    for (const given of ['/etc/x', 'C:\\x\\y', 'D:/y', '\\\\server\\share\\z']) expect(absolutePath('/work', given)).toBe(given);
  });
});
