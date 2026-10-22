import * as vscode from 'vscode';
import type { PageMessage } from './page-messages.ts';
import { onPageMessage, webviewPage, type ViewText } from './view-host.ts';

// Settings in an editor tab (plan 15 §15.6, ADR 0100, 22): one webview panel, "kvman Settings", framing kvwebui's
// settings page embedded, with the view's page, messages, and theme; a second press shows the open one.

export class SettingsPanel {
  #panel: vscode.WebviewPanel | undefined;
  #url: string | undefined;
  readonly #extensionUri: vscode.Uri;
  readonly #text: ViewText;
  readonly #message: (message: PageMessage) => void;

  constructor(extensionUri: vscode.Uri, text: ViewText, message: (message: PageMessage) => void) {
    this.#extensionUri = extensionUri;
    this.#text = text;
    this.#message = message;
  }

  open(url: string): void {
    const panel = this.#panel ?? this.#create();
    if (url !== this.#url) {
      this.#url = url;
      panel.webview.html = webviewPage(panel.webview, this.#extensionUri, this.#text, { kind: 'frame', url, port: Number(new URL(url).port) }, 'panel');
    }
    panel.reveal();
  }

  #create(): vscode.WebviewPanel {
    const panel = vscode.window.createWebviewPanel('kvman.settings', this.#text.translate('vscode.settingsTitle'), vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [this.#extensionUri] });
    const messages = onPageMessage(panel.webview, this.#message);
    panel.onDidDispose(() => {
      messages.dispose();
      this.#panel = undefined;
      this.#url = undefined;
    });
    this.#panel = panel;
    return panel;
  }
}
