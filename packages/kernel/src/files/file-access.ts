import type { Caller, File } from '@kvman/sdk';
import { kernelProblem } from '../problems.ts';
import type { Files } from './files.ts';

// Who may reach a file (plan 02 §2.7, ADR 0009, 24): any caller reads a file of its job's workspace; only the owner
// unlinks it, except a user upload, which the user or any extension may unlink.

export function fileInWorkspace(files: Files, id: string, workspaceId: string): File {
  const file = files.get(id);
  if (file.workspaceId !== workspaceId) throw kernelProblem('NOT_FOUND', `There is no file ${id} in this workspace.`, { id });
  return file;
}

export function mayUnlink(owner: File['owner'], caller: Caller): boolean {
  if (owner.kind === 'user') return caller.kind === 'user' || caller.kind === 'extension';
  return caller.kind === 'extension' && caller.name === owner.name;
}

export function unlinkAs(files: Files, id: string, workspaceId: string, caller: Caller): void {
  const file = fileInWorkspace(files, id, workspaceId);
  if (!mayUnlink(file.owner, caller)) throw kernelProblem('NOT_PUBLIC', `The file ${id} belongs to ${file.owner.kind === 'extension' ? file.owner.name : 'the user'}.`, { id });
  files.unlink(id);
}
