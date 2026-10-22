import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { translator } from '../src/catalog.ts';

// The frame's opens in VS Code's editors, and Settings in a tab (15 §15.4 and §15.6, ADR 0100, 22 and 25 to 27),
// against the fake `vscode` module.

type Fake = typeof import('./support/fake-vscode.ts');
const folders: string[] = [];

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

async function fresh() {
  vi.resetModules();
  const vscode: Fake = await import('./support/fake-vscode.ts');
  // `vscode` is the fake here too, with VS Code's own types.
  const typed = await import('vscode');
  const { Editor } = await import('../src/editor.ts');
  const { SettingsPanel } = await import('../src/settings-panel.ts');
  const translate = translator('en');
  const editor = new Editor(translate);
  editor.register();
  const settings = new SettingsPanel(typed.Uri.file('/ext'), { language: 'en', translate, logFile: '/log' }, () => undefined);
  return { vscode, fake: vscode.fake, editor, settings };
}

function folder(): string {
  const made = mkdtempSync(path.join(tmpdir(), 'kvman-editor-'));
  folders.push(made);
  return made;
}

describe("the frame's opens in VS Code (15 §15.4, ADR 0100, 25 to 27)", () => {
  it('M4.6-H5 a file opens as a preview at its line; a diff is the file, or an empty document, against the proposed text', async () => {
    const { fake, editor, vscode } = await fresh();
    const base = folder();
    const there = path.join(base, 'a.ts');
    writeFileSync(there, 'old');
    editor.openFile(there, 12);
    editor.openFile(there);
    expect(fake.shown).toEqual([
      { path: there, options: { preview: true, selection: new vscode.Range(11, 0, 11, 0) } },
      { path: there, options: { preview: true } },
    ]);
    editor.openDiff('a.ts (proposed)', there, 'new');
    editor.openDiff('new.ts (proposed)', path.join(base, 'new.ts'), 'fresh');
    const diffs = fake.runs.filter((run) => run.id === 'vscode.diff');
    const provider = fake.contentProviders.get('kvman-proposed');
    const text = (uri: unknown) => (provider === undefined ? undefined : provider.provideTextDocumentContent(uri as Parameters<typeof provider.provideTextDocumentContent>[0]));
    expect(diffs.map((run) => [String(run.args[0]).startsWith('file://') ? 'file' : text(run.args[0]), text(run.args[1]), run.args[2], run.args[3]])).toEqual([
      ['file', 'new', 'a.ts (proposed)', { preview: true }],
      ['', 'fresh', 'new.ts (proposed)', { preview: true }],
    ]);
  });

  it("M4.6-H5 a change runs VS Code's Git diff, and its failure says there's no Git change", async () => {
    const { fake, editor } = await fresh();
    editor.openChange('/w/a.ts');
    expect(fake.runs.at(-1)).toEqual({ id: 'git.openChange', args: [expect.objectContaining({ fsPath: '/w/a.ts' })] });
    expect(fake.infos).toEqual([]);
    fake.failing.add('git.openChange');
    editor.openChange('/w/a.ts');
    await vi.waitFor(() => expect(fake.infos).toEqual(["There's no Git change to show for this file."]));
  });

  it('M4.6-H4 Settings opens one tab framing the settings page, and a second press shows it', async () => {
    const { fake, settings } = await fresh();
    const url = 'http://127.0.0.1:3737/kvwebui/settings?workspace=w2&embed=parent';
    settings.open(url);
    settings.open(url);
    expect(fake.panels).toHaveLength(1);
    expect(fake.panels[0]?.title).toBe('kvman Settings');
    expect(fake.panels[0]?.reveals).toBe(2);
    expect(fake.panels[0]?.webview.html).toContain('src="http://127.0.0.1:3737/kvwebui/settings?workspace=w2&amp;embed=parent"');
    expect(fake.panels[0]?.webview.html).toContain('data-place="panel"');
    expect(fake.panels[0]?.webview.html).toContain('frame-src http://127.0.0.1:3737;');
  });
});
