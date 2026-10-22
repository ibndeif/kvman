import type { ExtensionContext } from 'vscode';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { escapeHtml } from '../src/view-html.ts';
import { fakeProgram } from './support/fake-program.ts';

// The extension through its entry, against the fake `vscode` module and the fake kvman program.

type Fake = typeof import('./support/fake-vscode.ts');

async function activated(mode: string, setup: (vscode: Fake) => void = () => undefined) {
  vi.resetModules();
  const vscode: Fake = await import('./support/fake-vscode.ts');
  const program = fakeProgram(mode);
  vscode.fake.settings['path'] = program.program;
  vscode.fake.folders = [{ uri: vscode.Uri.file(program.folder) }];
  setup(vscode);
  const extension = await import('../src/extension.ts');
  const context = { subscriptions: [], extensionUri: vscode.Uri.file('/ext'), extension: { packageJSON: { version: '0.4.7' } } };
  extension.activate(context as unknown as ExtensionContext);
  vscode.fake.provider?.resolveWebviewView(vscode.fake.view);
  return { vscode, program, extension, fake: vscode.fake };
}

let deactivate: (() => void) | undefined;

afterEach(() => {
  deactivate?.();
  deactivate = undefined;
});

const framed = (fake: Fake['fake']) => fake.view.webview.html.includes('<iframe');
const shows = (fake: Fake['fake'], text: string) => fake.view.webview.html.includes(escapeHtml(text));

describe('the extension in VS Code (15, ADR 0099)', () => {
  it('M4.2-H1 M4.6-H2 showing the view frames kvman of the first folder, with embed=parent', async () => {
    const { fake, program, extension } = await activated('running');
    deactivate = extension.deactivate;
    await vi.waitFor(() => expect(framed(fake)).toBe(true));
    expect(fake.view.webview.html).toContain('src="http://127.0.0.1:3737/?workspace=home&amp;embed=parent"');
    expect(JSON.parse(program.recorded().at(-1) ?? '')).toEqual({ args: ['--pipe', '--no-open'], folder: program.folder });
  });

  it("M4.2-H15 a new window from the frame opens in the system's browser, and another scheme does not", async () => {
    const { fake, extension } = await activated('running');
    deactivate = extension.deactivate;
    await vi.waitFor(() => expect(framed(fake)).toBe(true));
    fake.post({ from: 'frame', data: { kind: 'kvman.open', url: 'https://auth.example/x' } });
    fake.post({ from: 'frame', data: { kind: 'kvman.open', url: 'file:///etc/passwd' } });
    expect(fake.opened).toEqual(['https://auth.example/x']);
  });

  it('M4.2-H8 a trust line opens a modal message with each version, and Run them answers it', async () => {
    const { fake, program, extension } = await activated('trust', (vscode) => {
      vscode.fake.answerWarning = (buttons) => buttons[0];
    });
    deactivate = extension.deactivate;
    await vi.waitFor(() => expect(framed(fake)).toBe(true));
    expect(fake.warnings).toEqual([
      { text: 'These extensions are not part of kvman and can do anything you can:', options: { modal: true, detail: '• @acme/hello@1.0.0 (npm:1.0.0)\n\nRun them?' }, buttons: ['Run them'] },
    ]);
    expect(program.recorded().at(-1)).toBe('{"trust":true}');
  });

  it('M4.2-H4 M4.2-H5 Install kvman runs the npm task, and a failing code says the install failed', async () => {
    const { fake, extension } = await activated('running', (vscode) => {
      vscode.fake.settings['path'] = '/no/such/kvman';
    });
    deactivate = extension.deactivate;
    await vi.waitFor(() => expect(shows(fake, "kvman isn't installed.")).toBe(true));
    fake.post({ from: 'page', action: 'install' });
    await vi.waitFor(() => expect(fake.tasks).toHaveLength(1));
    expect([fake.tasks[0]?.name, fake.tasks[0]?.execution.command, fake.tasks[0]?.execution.args]).toEqual(['Install kvman', 'npm', ['i', '-g', 'kvman', '--no-fund', '--loglevel=error']]);
    fake.endTask(1);
    await vi.waitFor(() => expect(shows(fake, "kvman couldn't be installed. The terminal shows why.")).toBe(true));
  });

  it('M4.2-H11 deactivating closes the input of the kvman this window owns', async () => {
    const { fake, program, extension } = await activated('running');
    await vi.waitFor(() => expect(framed(fake)).toBe(true));
    extension.deactivate();
    await vi.waitFor(() => expect(program.recorded().at(-1)).toBe('input closed'));
  });

  it('M4.2-H3 a remote first folder shows the local-only message and runs nothing', async () => {
    const { fake, program, extension } = await activated('running', (vscode) => {
      vscode.fake.folders = [{ uri: vscode.Uri.parse('vscode-remote://ssh-remote+box/home/a') }];
    });
    deactivate = extension.deactivate;
    expect(fake.view.webview.html).toContain('kvman works on local folders only for now.');
    expect(program.recorded()).toHaveLength(0);
  });

  it('M4.2-H17 with VS Code in Arabic the view is Arabic and right to left', async () => {
    const { fake, extension } = await activated('running', (vscode) => {
      vscode.fake.language = 'ar';
      vscode.fake.folders = [{ uri: vscode.Uri.parse('vscode-remote://ssh-remote+box/home/a') }];
    });
    deactivate = extension.deactivate;
    expect(fake.view.webview.html).toContain('dir="rtl"');
    expect(fake.view.webview.html).toContain('يعمل kvman على المجلدات المحلية فقط حاليًا.');
  });

  it('M4.2-H19 the commands: Open focuses the view, Open in browser opens the start workspace', async () => {
    const { fake, extension } = await activated('running');
    deactivate = extension.deactivate;
    await vi.waitFor(() => expect(framed(fake)).toBe(true));
    await fake.commands.get('kvman.open')?.();
    expect(fake.executed).toEqual(['kvman.view.focus']);
    await fake.commands.get('kvman.openInBrowser')?.();
    expect(fake.opened).toEqual(['http://127.0.0.1:3737/?workspace=home']);
  });

  it('M4.6-H6 M4.6-H4 Add to kvman chat shows the view and waits for the frame; Pages and Settings follow its workspace', async () => {
    const { fake, extension, program, vscode } = await activated('running');
    deactivate = extension.deactivate;
    await vi.waitFor(() => expect(framed(fake)).toBe(true));
    await fake.commands.get('kvman.addToChat')?.(vscode.Uri.file(`${program.folder}/README.md`));
    expect(fake.executed).toContain('kvman.view.focus');
    expect(fake.viewPosts).toEqual([]);
    fake.post({ from: 'frame', data: { kind: 'kvman.state', workspaceId: 'w2' } });
    await fake.commands.get('kvman.showPages')?.();
    expect(fake.viewPosts).toEqual([
      { from: 'extension', message: { kind: 'kvman.insert', text: '`README.md`' } },
      { from: 'extension', message: { kind: 'kvman.pages' } },
    ]);
    await fake.commands.get('kvman.openSettings')?.();
    expect(fake.panels[0]?.webview.html).toContain('src="http://127.0.0.1:3737/kvwebui/settings?workspace=w2&amp;embed=parent"');
    await fake.commands.get('kvman.openInBrowser')?.();
    expect(fake.opened.at(-1)).toBe('http://127.0.0.1:3737/?workspace=w2');
  });

  it("M4.6-H5 the frame's opens reach VS Code's editors, and a relative path opens nothing", async () => {
    const { fake, extension } = await activated('running');
    deactivate = extension.deactivate;
    await vi.waitFor(() => expect(framed(fake)).toBe(true));
    fake.post({ from: 'frame', data: { kind: 'kvman.openFile', path: '/w/a.ts', line: 3 } });
    fake.post({ from: 'frame', data: { kind: 'kvman.openFile', path: 'w/a.ts' } });
    fake.post({ from: 'frame', data: { kind: 'kvman.openChange', path: '/w/a.ts' } });
    expect(fake.shown.map((entry) => entry.path)).toEqual(['/w/a.ts']);
    expect(fake.runs.filter((run) => run.id === 'git.openChange')).toHaveLength(1);
  });

  it('M4.7-H2 a frame that offers New shows the button, and a press of New reaches the frame', async () => {
    const { fake, extension } = await activated('running');
    deactivate = extension.deactivate;
    await vi.waitFor(() => expect(framed(fake)).toBe(true));
    fake.post({ from: 'frame', data: { kind: 'kvman.state', workspaceId: 'w1' } });
    fake.post({ from: 'frame', data: { kind: 'kvman.actions', new: true } });
    expect(fake.runs.filter((run) => run.id === 'setContext')).toEqual([{ id: 'setContext', args: ['kvman.canNew', true] }]);
    await fake.commands.get('kvman.new')?.();
    expect(fake.viewPosts).toEqual([{ from: 'extension', message: { kind: 'kvman.new' } }]);
  });

  it("M4.7-E6 the view's and the Settings tab's subscriptions end with them", async () => {
    const { fake, extension } = await activated('running');
    deactivate = extension.deactivate;
    await vi.waitFor(() => expect(framed(fake)).toBe(true));
    await fake.commands.get('kvman.openSettings')?.();
    expect(fake.listeners()).toEqual({ viewMessages: 1, visibility: 1, panelMessages: 1 });
    fake.disposeView();
    fake.closePanel();
    expect(fake.listeners()).toEqual({ viewMessages: 0, visibility: 0, panelMessages: 0 });
  });
});

