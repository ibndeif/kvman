import { existsSync } from 'node:fs';
import path from 'node:path';
import * as vscode from 'vscode';
import type { Translate } from './catalog.ts';

// The frame's opens in VS Code's editors (plan 15 §15.4, ADR 0100, 25 to 27): a file as a preview at its line, a diff
// of the file (or an empty document) against a read-only document of the proposed text, and VS Code's own Git diff.

const scheme = 'kvman-proposed';
// The proposed documents kept for VS Code to read; older ones are let go.
const keptDocuments = 50;

export class Editor implements vscode.TextDocumentContentProvider {
  readonly #texts = new Map<string, string>();
  readonly #translate: Translate;
  #count = 0;

  constructor(translate: Translate) {
    this.#translate = translate;
  }

  /** Lets VS Code read the proposed documents; the result is disposed with the extension. */
  register(): vscode.Disposable {
    return vscode.workspace.registerTextDocumentContentProvider(scheme, this);
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.#texts.get(uri.toString()) ?? '';
  }

  openFile(file: string, line?: number): void {
    const options: vscode.TextDocumentShowOptions = line === undefined ? { preview: true } : { preview: true, selection: new vscode.Range(line - 1, 0, line - 1, 0) };
    void vscode.window.showTextDocument(vscode.Uri.file(file), options).then(undefined, (error: unknown) => this.#report(error));
  }

  openDiff(title: string, file: string, after: string): void {
    const left = existsSync(file) ? vscode.Uri.file(file) : this.#document('empty', path.basename(file), '');
    const right = this.#document('proposed', path.basename(file), after);
    void vscode.commands.executeCommand('vscode.diff', left, right, title, { preview: true }).then(undefined, (error: unknown) => this.#report(error));
  }

  openChange(file: string): void {
    void vscode.commands.executeCommand('git.openChange', vscode.Uri.file(file)).then(undefined, () => void vscode.window.showInformationMessage(this.#translate('vscode.noGitChange')));
  }

  #document(kind: string, name: string, text: string): vscode.Uri {
    this.#count += 1;
    const uri = vscode.Uri.parse(`${scheme}:/${String(this.#count)}/${kind}/${encodeURIComponent(name)}`);
    this.#texts.set(uri.toString(), text);
    for (const old of [...this.#texts.keys()].slice(0, Math.max(0, this.#texts.size - keptDocuments))) this.#texts.delete(old);
    return uri;
  }

  #report(error: unknown): void {
    void vscode.window.showErrorMessage(this.#translate('vscode.problem', { message: error instanceof Error ? error.message : String(error) }));
  }
}
