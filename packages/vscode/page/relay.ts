// The view's page script (plan 15 §15.4, ADR 0100, 24): it passes on what kvwebui's frame posts, only from the frame's
// own window at kvman's origin, and the presses of the extension's own buttons; it answers the frame's `kvman.state`
// with VS Code's theme, and sends it again when VS Code's theme changes; and it gives the frame the extension's
// messages. The extension checks every message's shape, and so does kvwebui.

type VsCodeApi = { postMessage(message: unknown): void };
declare function acquireVsCodeApi(): VsCodeApi;

const host = acquireVsCodeApi();
const origin = document.body.dataset['origin'];
const place = document.body.dataset['place'];
const frame = document.querySelector('iframe');
let frameSpoke = false;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

// The first of VS Code's variables that has a value, else a CSS system color.
function reader(): (fallback: string, ...names: string[]) => string {
  const style = getComputedStyle(document.documentElement);
  return (fallback, ...names) => names.map((name) => style.getPropertyValue(name).trim()).find((value) => value !== '') ?? fallback;
}

function theme(): unknown {
  const read = reader();
  const classes = document.body.classList;
  const background = place === 'panel' ? read('Canvas', '--vscode-editor-background', '--vscode-sideBar-background') : read('Canvas', '--vscode-sideBar-background', '--vscode-editor-background');
  return {
    kind: 'kvman.theme',
    dark: classes.contains('vscode-dark') || (classes.contains('vscode-high-contrast') && !classes.contains('vscode-high-contrast-light')),
    colors: {
      background,
      surface: background,
      text: read('CanvasText', '--vscode-foreground'),
      muted: read('GrayText', '--vscode-descriptionForeground', '--vscode-foreground'),
      border: read('GrayText', '--vscode-panel-border', '--vscode-widget-border', '--vscode-contrastBorder'),
      primary: read('Highlight', '--vscode-button-background', '--vscode-focusBorder'),
      onPrimary: read('HighlightText', '--vscode-button-foreground'),
      danger: read('CanvasText', '--vscode-errorForeground'),
      warning: read('CanvasText', '--vscode-editorWarning-foreground'),
      success: read('CanvasText', '--vscode-testing-iconPassed'),
    },
    fonts: { sans: read('system-ui, sans-serif', '--vscode-font-family'), mono: read('monospace', '--vscode-editor-font-family'), size: read('13px', '--vscode-font-size') },
  };
}

// What the extension may give the frame (ADR 0100, 11): the pages menu's opening and text to insert. VS Code delivers the
// extension's messages from the page's parent at the page's own origin; a frame inside kvman's frame, such as an
// artifact, can post to this page too, so nothing else is passed on.
function extensionMessage(data: unknown): unknown {
  if (!isRecord(data) || data['from'] !== 'extension' || !isRecord(data['message'])) return undefined;
  const message = data['message'];
  if (message['kind'] === 'kvman.pages') return { kind: 'kvman.pages' };
  if (message['kind'] === 'kvman.insert' && typeof message['text'] === 'string') return { kind: 'kvman.insert', text: message['text'] };
  return undefined;
}

function toFrame(message: unknown): void {
  if (frame?.contentWindow && origin !== undefined) frame.contentWindow.postMessage(message, origin);
}

window.addEventListener('message', (event) => {
  // A frame that holds no page has no window, so a message without a source never counts as the frame's.
  const fromFrame = frame !== null && event.source !== null && event.source === frame.contentWindow;
  const data: unknown = event.data;
  if (fromFrame) {
    if (event.origin !== origin) return;
    if (isRecord(data) && data['kind'] === 'kvman.state') {
      frameSpoke = true;
      toFrame(theme());
    }
    host.postMessage({ from: 'frame', data });
  } else if (event.source === window.parent && event.origin === window.location.origin) {
    const message = extensionMessage(data);
    if (message !== undefined) toFrame(message);
  }
});

// VS Code marks its theme on the body's class.
new MutationObserver(() => {
  if (frameSpoke) toFrame(theme());
}).observe(document.body, { attributes: true, attributeFilter: ['class'] });

for (const button of document.querySelectorAll<HTMLButtonElement>('button[data-action]')) {
  button.addEventListener('click', () => host.postMessage({ from: 'page', action: button.dataset['action'] }));
}
