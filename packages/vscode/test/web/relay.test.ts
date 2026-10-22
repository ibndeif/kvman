import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The page's relay script, run against a page made as the extension makes it, with VS Code's `acquireVsCodeApi`.

const posted: unknown[] = [];

beforeEach(() => {
  vi.stubGlobal('acquireVsCodeApi', () => ({ postMessage: (message: unknown) => posted.push(message) }));
});

afterEach(() => {
  posted.splice(0);
  vi.unstubAllGlobals();
  vi.resetModules();
  document.body.replaceChildren();
  delete document.body.dataset['origin'];
  document.body.className = '';
  document.documentElement.removeAttribute('style');
});

async function loadPage(html: string, origin?: string): Promise<void> {
  document.body.innerHTML = html;
  if (origin !== undefined) document.body.dataset['origin'] = origin;
  await import('../../page/relay.ts');
}

const send = (data: unknown, origin: string, source: Window | null) => window.dispatchEvent(new MessageEvent('message', { data, origin, source }));
const frameWindow = (): Window => {
  const shown = document.querySelector('iframe')?.contentWindow;
  if (shown === null || shown === undefined) throw new Error('The page has no frame.');
  return shown;
};

describe("the view's relay (15 §15.4, ADR 0099, 23)", () => {
  it("M4.2-H15 a message from the frame's window at kvman's origin is passed on", async () => {
    await loadPage('<iframe src="about:blank"></iframe>', 'http://127.0.0.1:3737');
    send({ kind: 'kvman.open', url: 'https://auth.example/x' }, 'http://127.0.0.1:3737', frameWindow());
    expect(posted).toEqual([{ from: 'frame', data: { kind: 'kvman.open', url: 'https://auth.example/x' } }]);
  });

  it('M4.2-E4 a message from another window or origin is dropped', async () => {
    await loadPage('<iframe src="about:blank"></iframe>', 'http://127.0.0.1:3737');
    send({ kind: 'kvman.open', url: 'https://a.example' }, 'http://127.0.0.1:9999', frameWindow());
    send({ kind: 'kvman.open', url: 'https://a.example' }, 'http://127.0.0.1:3737', window);
    send({ kind: 'kvman.open', url: 'https://a.example' }, 'http://127.0.0.1:3737', null);
    expect(posted).toEqual([]);
  });

  it("M4.2-H4 a press of one of the extension's buttons is passed on, and a page without a frame passes no message", async () => {
    await loadPage('<button type="button" data-action="install">Install kvman</button>');
    document.querySelector('button')?.click();
    send({ kind: 'kvman.open', url: 'https://a.example' }, 'http://127.0.0.1:3737', window);
    expect(posted).toEqual([{ from: 'page', action: 'install' }]);
  });

  it("M4.6-H3 the frame's kvman.state gets VS Code's theme, again when VS Code's theme changes, and is passed on", async () => {
    const variables: Record<string, string> = {
      '--vscode-sideBar-background': '#252526',
      '--vscode-editor-background': '#1e1e1e',
      '--vscode-foreground': '#cccccc',
      '--vscode-descriptionForeground': '#9d9d9d',
      '--vscode-panel-border': '#3c3c3c',
      '--vscode-button-background': '#0e639c',
      '--vscode-button-foreground': '#ffffff',
      '--vscode-errorForeground': '#f48771',
      '--vscode-editorWarning-foreground': '#cca700',
      '--vscode-testing-iconPassed': '#73c991',
      '--vscode-font-family': 'Ubuntu',
      '--vscode-editor-font-family': 'Fira Code',
      '--vscode-font-size': '13px',
    };
    for (const [name, value] of Object.entries(variables)) document.documentElement.style.setProperty(name, value);
    document.body.className = 'vscode-dark';
    document.body.dataset['place'] = 'view';
    await loadPage('<iframe src="about:blank"></iframe>', 'http://127.0.0.1:3737');
    const toFrame = vi.spyOn(frameWindow(), 'postMessage').mockImplementation(() => undefined);
    send({ kind: 'kvman.state', workspaceId: 'w1' }, 'http://127.0.0.1:3737', frameWindow());
    const theme = {
      kind: 'kvman.theme',
      dark: true,
      colors: { background: '#252526', surface: '#252526', text: '#cccccc', muted: '#9d9d9d', border: '#3c3c3c', primary: '#0e639c', onPrimary: '#ffffff', danger: '#f48771', warning: '#cca700', success: '#73c991' },
      fonts: { sans: 'Ubuntu', mono: 'Fira Code', size: '13px' },
    };
    expect(toFrame.mock.calls).toEqual([[theme, 'http://127.0.0.1:3737']]);
    expect(posted).toEqual([{ from: 'frame', data: { kind: 'kvman.state', workspaceId: 'w1' } }]);
    document.body.className = 'vscode-light';
    await vi.waitFor(() => expect(toFrame).toHaveBeenCalledTimes(2));
    expect(toFrame.mock.calls[1]).toEqual([{ ...theme, dark: false }, 'http://127.0.0.1:3737']);
  });

  it("M4.6-E2 another window's kvman.state gets no theme and isn't passed on; the extension's messages go to the frame", async () => {
    await loadPage('<iframe src="about:blank"></iframe>', 'http://127.0.0.1:3737');
    const toFrame = vi.spyOn(frameWindow(), 'postMessage').mockImplementation(() => undefined);
    send({ kind: 'kvman.state', workspaceId: 'w1' }, 'http://127.0.0.1:3737', window);
    expect(toFrame).not.toHaveBeenCalled();
    expect(posted).toEqual([]);
    const own = window.location.origin;
    send({ from: 'extension', message: { kind: 'kvman.pages' } }, own, window.parent);
    send({ from: 'extension', message: { kind: 'kvman.insert', text: 'hello' } }, own, window.parent);
    send({ from: 'other', message: { kind: 'kvman.pages' } }, own, window.parent);
    send({ from: 'extension', message: { kind: 'kvman.theme', dark: true } }, own, window.parent);
    send({ from: 'extension', message: { kind: 'kvman.insert', text: 5 } }, own, window.parent);
    expect(toFrame.mock.calls).toEqual([[{ kind: 'kvman.pages' }, 'http://127.0.0.1:3737'], [{ kind: 'kvman.insert', text: 'hello' }, 'http://127.0.0.1:3737']]);
  });

  it("M4.7-H1 the extension's kvman.pages, kvman.new, and kvman.insert at the page's own origin go to the frame, from whichever window VS Code posts them", async () => {
    await loadPage('<iframe src="about:blank"></iframe>', 'http://127.0.0.1:3911');
    const toFrame = vi.spyOn(frameWindow(), 'postMessage').mockImplementation(() => undefined);
    const own = window.location.origin;
    send({ from: 'extension', message: { kind: 'kvman.pages' } }, own, null);
    send({ from: 'extension', message: { kind: 'kvman.new' } }, own, window);
    send({ from: 'extension', message: { kind: 'kvman.insert', text: 'hello' } }, own, window.parent);
    expect(toFrame.mock.calls).toEqual([
      [{ kind: 'kvman.pages' }, 'http://127.0.0.1:3911'],
      [{ kind: 'kvman.new' }, 'http://127.0.0.1:3911'],
      [{ kind: 'kvman.insert', text: 'hello' }, 'http://127.0.0.1:3911'],
    ]);
  });

  it("M4.7-E1 an extension message at another origin, such as kvman's, an artifact's, or a dev server's, is dropped", async () => {
    await loadPage('<iframe src="about:blank"></iframe><iframe name="artifact" src="about:blank"></iframe>', 'http://127.0.0.1:3737');
    const toFrame = vi.spyOn(frameWindow(), 'postMessage').mockImplementation(() => undefined);
    const artifact = document.querySelectorAll('iframe')[1]?.contentWindow ?? null;
    const injected = { from: 'extension', message: { kind: 'kvman.insert', text: 'injected' } };
    send(injected, 'http://127.0.0.1:3737', artifact);
    send(injected, 'null', artifact);
    send(injected, 'http://127.0.0.1:5173', window.parent);
    expect(toFrame).not.toHaveBeenCalled();
    expect(posted).toEqual([]);
  });
});
