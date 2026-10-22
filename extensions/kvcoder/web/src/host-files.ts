import { editResult, readResult } from './call-results.ts';
import { callKind, type CallView } from './call-view.ts';
import { fields } from './kvman.ts';

// Files a call names, for the host that embeds kvwebui (plan 08 §8.7, ADR 0100, 17 and 18): the path to open, at which
// line, and what "Open diff" asks for. The host takes absolute paths; a call's paths are the workspace's.

export type FileTarget = { path: string; line?: number };
export type PreviewInput = { path: string; edits: { oldText: string; newText: string; replaceAll?: boolean }[] } | { path: string; content: string };

const absolute = /^(?:\/|\\\\|[A-Za-z]:[\\/])/;

/** A path of the workspace at `base` as an absolute one; an absolute path stays as it is. */
export function absolutePath(base: string, requested: string): string {
  if (absolute.test(requested)) return requested;
  const trimmed = requested.replace(/^\.\//, '');
  return `${base.replace(/[\\/]+$/, '')}/${trimmed}`;
}

/** A path's last part, for a diff's title. */
export function fileName(requested: string): string {
  return requested.split(/[\\/]/).filter((part) => part !== '').at(-1) ?? requested;
}

const pathOf = (view: CallView): string | undefined => (typeof view.fields?.['path'] === 'string' && view.fields['path'] !== '' ? view.fields['path'] : undefined);

/** The file a read, an edit, or a write names, at its line: a read's first shown line, an edit's first changed line. */
export function fileTarget(view: CallView, result: unknown): FileTarget | undefined {
  const kind = callKind(view);
  const path = pathOf(view);
  if (path === undefined || (kind !== 'read' && kind !== 'edit' && kind !== 'write')) return undefined;
  const line = kind === 'read' ? readResult(result)?.fromLine : kind === 'edit' ? editResult(result)?.firstChangedLine : undefined;
  return line === undefined ? { path } : { path, line };
}

/** What `kvcoder.file.preview.get` is asked for an edit's or a write's "Open diff"; none for any other call. */
export function previewInput(view: CallView): PreviewInput | undefined {
  const kind = callKind(view);
  const path = pathOf(view);
  if (path === undefined) return undefined;
  if (kind === 'write' && typeof view.fields?.['content'] === 'string') return { path, content: view.fields['content'] };
  if (kind !== 'edit') return undefined;
  return { path, edits: editList(view.fields?.['edits']) };
}

// An edit payload's replacements, `replaceAll` included, as `fs edit` takes them.
function editList(given: unknown): Extract<PreviewInput, { edits: unknown }>['edits'] {
  if (!Array.isArray(given)) return [];
  return given.flatMap((edit: unknown) => {
    const { oldText, newText, replaceAll } = fields(edit);
    if (typeof oldText !== 'string' || typeof newText !== 'string') return [];
    return [{ oldText, newText, ...(replaceAll === true ? { replaceAll: true } : {}) }];
  });
}
