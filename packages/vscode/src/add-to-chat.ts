import * as vscode from 'vscode';
import { fileText, lastSelectedLine, selectionText } from './chat-text.ts';

// What "Add to kvman chat" adds (plan 15 §15.6, ADR 0100, 28, ADR 0101, 4): the editor's selection when the command comes
// from it, the file the explorer gave, or else the open editor's file; paths are relative to the window's folder.

/** The text for the command's resource, or undefined when there is nothing to add. */
export function chatTextFor(resource: unknown): string | undefined {
  const editor = vscode.window.activeTextEditor;
  const given = resource instanceof vscode.Uri ? resource : undefined;
  if (editor !== undefined && !editor.selection.isEmpty && (given === undefined || given.toString() === editor.document.uri.toString())) {
    const { start, end } = editor.selection;
    return selectionText({ path: vscode.workspace.asRelativePath(editor.document.uri, false), firstLine: start.line + 1, lastLine: lastSelectedLine(start, end), language: editor.document.languageId, code: editor.document.getText(editor.selection) });
  }
  const file = given ?? editor?.document.uri;
  return file?.scheme === 'file' ? fileText(vscode.workspace.asRelativePath(file, false)) : undefined;
}
