import { hintKey, type Language, type TextKey, type Translate } from './catalog.ts';
import type { Action, View } from './session.ts';

// The view's page (plan 15 §15.4): kvwebui in a frame, or one of the extension's own states with its buttons. Its
// policy allows only its own script and stylesheet, and, for the frame, kvman's origin.

// The page is the side bar's view or the Settings tab, whose colors differ (ADR 0100, 24).
export type Place = 'view' | 'panel';
// What a page shows: one of the extension's own states, or a frame of kvman at an address (the view's, or the Settings
// tab's).
export type PageView = Exclude<View, { kind: 'frame' }> | { kind: 'frame'; url: string; port: number };
export type PageContext = { language: Language; translate: Translate; place: Place; cspSource: string; nonce: string; scriptUri: string; styleUri: string; logFile: string };

type Line = { text: string; role: 'title' | 'text' | 'code' };
type Button = { action: Action; label: TextKey; link?: boolean };
type Message = { lines: Line[]; buttons: Button[]; busy: boolean };

const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => entities[character] ?? character);
}

function failedMessage(view: Extract<View, { kind: 'failed' }>, context: PageContext): Message {
  const t = context.translate;
  const hint = t(hintKey(view.problem.code), { file: context.logFile });
  const lines: Line[] = [{ text: t('vscode.failed.title'), role: 'title' }, { text: `${view.problem.code}: ${view.problem.message}`, role: 'code' }, { text: hint, role: 'text' }];
  return { lines, buttons: [{ action: 'start', label: 'vscode.tryAgain' }, { action: 'showLog', label: 'vscode.showLog' }], busy: false };
}

function messageOf(view: Exclude<View, { kind: 'frame' }>, context: PageContext): Message {
  const t = context.translate;
  const text = (key: TextKey, params?: Record<string, string>): Line[] => [{ text: t(key, params), role: 'text' }];
  const install = (update: boolean): Button => ({ action: update ? 'update' : 'install', label: 'vscode.tryAgain' });
  switch (view.kind) {
    case 'remote':
      return { lines: text('vscode.remote'), buttons: [], busy: false };
    case 'starting':
      return { lines: text('vscode.starting'), buttons: [], busy: true };
    case 'installing':
      return { lines: text('vscode.installing'), buttons: [], busy: true };
    case 'missing':
      return { lines: text('vscode.missing'), buttons: [{ action: 'install', label: 'vscode.install' }], busy: false };
    case 'tooOld':
      return { lines: text('vscode.tooOld', { version: view.version, minimum: view.minimum }), buttons: [{ action: 'update', label: 'vscode.update' }], busy: false };
    case 'npmMissing':
      return { lines: text('vscode.npmMissing'), buttons: [{ action: 'nodejs', label: 'vscode.nodejs', link: true }, install(view.update)], busy: false };
    case 'installFailed':
      return { lines: text('vscode.installFailed'), buttons: [install(view.update)], busy: false };
    case 'failed':
      return failedMessage(view, context);
    case 'stopped':
      return { lines: text('vscode.stopped'), buttons: [{ action: 'start', label: 'vscode.startAgain' }, { action: 'showLog', label: 'vscode.showLog' }], busy: false };
  }
}

function messageBody(message: Message, context: PageContext): string {
  const lines = message.lines.map((line) => (line.role === 'title' ? `<h1>${escapeHtml(line.text)}</h1>` : `<p class="${line.role}">${escapeHtml(line.text)}</p>`));
  const buttons = message.buttons.map((button) => `<button type="button" class="${button.link === true ? 'link' : 'button'}" data-action="${button.action}">${escapeHtml(context.translate(button.label))}</button>`);
  const progress = message.busy ? '<div class="progress" role="progressbar" aria-busy="true"></div>' : '';
  return `<main class="message" data-view>${progress}${lines.join('')}${buttons.length > 0 ? `<div class="buttons">${buttons.join('')}</div>` : ''}</main>`;
}

function policy(context: PageContext, port: number | undefined): string {
  const frame = port === undefined ? '' : ` frame-src http://127.0.0.1:${String(port)};`;
  return `default-src 'none';${frame} script-src 'nonce-${context.nonce}'; style-src ${context.cspSource}`;
}

/** The page for a view: its policy, its body, and the relay script. */
export function viewHtml(view: PageView, context: PageContext): string {
  const framed = view.kind === 'frame';
  const origin = framed ? ` data-origin="http://127.0.0.1:${String(view.port)}"` : '';
  const place = ` data-place="${context.place}"`;
  const body = framed ? `<iframe title="kvman" src="${escapeHtml(view.url)}" allow="clipboard-read; clipboard-write"></iframe>` : messageBody(messageOf(view, context), context);
  return [
    `<!doctype html><html lang="${context.language}" dir="${context.language === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8">`,
    `<meta http-equiv="Content-Security-Policy" content="${policy(context, framed ? view.port : undefined)}">`,
    `<link rel="stylesheet" href="${escapeHtml(context.styleUri)}"></head>`,
    `<body${place}${origin}>${body}<script type="module" nonce="${context.nonce}" src="${escapeHtml(context.scriptUri)}"></script></body></html>`,
  ].join('');
}
