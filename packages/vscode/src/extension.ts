import { homedir } from 'node:os';
import * as vscode from 'vscode';
import { z } from 'zod';
import { chatTextFor } from './add-to-chat.ts';
import { languageOf, translator } from './catalog.ts';
import { Controller } from './controller.ts';
import { Editor } from './editor.ts';
import type { PageMessage } from './page-messages.ts';
import { Session } from './session.ts';
import { SettingsPanel } from './settings-panel.ts';
import { logFile, startFolder } from './start-folder.ts';
import { ViewHost } from './view-host.ts';
import { openWeb, vscodeHost } from './vscode-host.ts';

// The extension's entry (plan 15): it reads where it runs, makes the session, and connects it to VS Code: the view,
// the Settings tab, the editor's opens, and the commands.

const manifestSchema = z.object({ version: z.string() });

let controller: Controller | undefined;

// A frame's opens go to VS Code's editors and browser; its workspace and the page's presses go to the session.
function route(message: PageMessage, editor: Editor, happen: Controller['happen']): void {
  switch (message.kind) {
    case 'pressed':
      return happen({ kind: 'pressed', action: message.action });
    case 'stated':
      return happen({ kind: 'stated', workspaceId: message.workspaceId });
    case 'open':
      return openWeb(message.url);
    case 'openFile':
      return editor.openFile(message.path, message.line);
    case 'openDiff':
      return editor.openDiff(message.title, message.path, message.after);
    case 'openChange':
      return editor.openChange(message.path);
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const folder = startFolder(vscode.workspace.workspaceFolders?.map((workspaceFolder) => workspaceFolder.uri), homedir());
  const language = languageOf(vscode.env.language);
  const translate = translator(language);
  const log = logFile(process.env['KVMAN_HOME'], homedir());
  const text = { language, translate, logFile: log };
  const extensionVersion = manifestSchema.parse(context.extension.packageJSON).version;
  const session = new Session({ remote: folder.kind === 'remote', extensionVersion, windows: process.platform === 'win32' });
  const editor = new Editor(translate);
  const happen: Controller['happen'] = (happening) => controller?.happen(happening);
  // The Settings tab's own workspace isn't the view's, so only its opens are taken.
  const settings = new SettingsPanel(context.extensionUri, text, (message) => (message.kind === 'stated' || message.kind === 'pressed' ? undefined : route(message, editor, happen)));
  const view = new ViewHost(context.extensionUri, text, { shown: () => happen({ kind: 'needed' }), message: (message) => route(message, editor, happen) });
  controller = new Controller(session, vscodeHost({ folder: folder.kind === 'local' ? folder.path : homedir(), view, settings, translate, logFile: log }));
  context.subscriptions.push(
    editor.register(),
    vscode.window.registerWebviewViewProvider('kvman.view', view, { webviewOptions: { retainContextWhenHidden: true } }),
    vscode.commands.registerCommand('kvman.open', () => vscode.commands.executeCommand('kvman.view.focus')),
    vscode.commands.registerCommand('kvman.showPages', () => happen({ kind: 'pages' })),
    vscode.commands.registerCommand('kvman.openSettings', () => happen({ kind: 'needed', request: 'settings' })),
    vscode.commands.registerCommand('kvman.openInBrowser', () => happen({ kind: 'needed', request: 'browser' })),
    vscode.commands.registerCommand('kvman.addToChat', async (resource: unknown) => {
      const added = chatTextFor(resource);
      if (added === undefined) return;
      await vscode.commands.executeCommand('kvman.view.focus');
      happen({ kind: 'insert', text: added });
    }),
    vscode.commands.registerCommand('kvman.install', () => happen({ kind: 'pressed', action: 'install' })),
  );
}

export function deactivate(): void {
  controller?.happen({ kind: 'closing' });
  controller = undefined;
}
