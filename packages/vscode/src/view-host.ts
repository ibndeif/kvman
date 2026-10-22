import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import type { Language, Translate } from './catalog.ts';
import type { FrameMessage } from './frame-requests.ts';
import { readPageMessage, type PageMessage } from './page-messages.ts';
import type { View } from './session.ts';
import { viewHtml, type PageView, type Place } from './view-html.ts';

// The webview view `kvman.view` (plan 15 §15.4): it shows the session's view, keeps its page while hidden, hands each
// page message and each time it is shown to the extension, and passes the extension's messages on to the frame.

export type ViewEvents = { shown(): void; message(message: PageMessage): void };
export type ViewText = { language: Language; translate: Translate; logFile: string };

/** The page of a webview for a view: its policy, its body, and the relay script, from the extension's folder. */
export function webviewPage(webview: vscode.Webview, extensionUri: vscode.Uri, text: ViewText, view: PageView, place: Place): string {
  const asset = (file: string): string => webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, file)).toString();
  return viewHtml(view, { ...text, place, cspSource: webview.cspSource, nonce: randomBytes(16).toString('base64url'), scriptUri: asset('page/relay.js'), styleUri: asset('page.css') });
}

/** Reads a webview's page messages, dropping any of another shape. */
export function onPageMessage(webview: vscode.Webview, handle: (message: PageMessage) => void): vscode.Disposable {
  return webview.onDidReceiveMessage((message: unknown) => {
    const read = readPageMessage(message);
    if (read !== undefined) handle(read);
  });
}

export class ViewHost implements vscode.WebviewViewProvider {
  #view: vscode.WebviewView | undefined;
  #latest: View | undefined;
  readonly #extensionUri: vscode.Uri;
  readonly #text: ViewText;
  readonly #events: ViewEvents;

  constructor(extensionUri: vscode.Uri, text: ViewText, events: ViewEvents) {
    this.#extensionUri = extensionUri;
    this.#text = text;
    this.#events = events;
  }

  // The view's subscriptions end with it, since VS Code may dispose the view and resolve it again (ADR 0101, 10).
  resolveWebviewView(view: vscode.WebviewView): void {
    this.#view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [this.#extensionUri] };
    const subscriptions = [
      onPageMessage(view.webview, (message) => this.#events.message(message)),
      view.onDidChangeVisibility(() => {
        if (view.visible) this.#events.shown();
      }),
    ];
    view.onDidDispose(() => {
      for (const subscription of subscriptions) subscription.dispose();
      if (this.#view === view) this.#view = undefined;
    });
    if (this.#latest !== undefined) this.#show(this.#latest);
    this.#events.shown();
  }

  render(view: View): void {
    this.#latest = view;
    this.#show(view);
  }

  /** Passes a message on to the frame, through the page. */
  post(message: FrameMessage): void {
    void this.#view?.webview.postMessage({ from: 'extension', message });
  }

  #show(view: View): void {
    const shown = this.#view;
    if (shown !== undefined) shown.webview.html = webviewPage(shown.webview, this.#extensionUri, this.#text, view, 'view');
  }
}
