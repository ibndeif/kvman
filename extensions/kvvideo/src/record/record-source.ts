import { inputPath } from '../files/workspace-paths.ts';
import { recordableAddress } from './address.ts';
import type { RecordSource } from './recorder.ts';

// What `record` and `look` open (plan 16 §16.5): a page of the workspace, or a website that isn't kvman's own address,
// at the device's size unless one is given.

export const defaultSize = { desktop: { width: 1280, height: 720 }, phone: { width: 390, height: 844 } };

export function sourceOf(root: string, input: { url?: string; page?: string }, ownPort: number | null): RecordSource {
  if (input.page !== undefined) return { kind: 'page', file: inputPath(root, input.page, ['.html', '.htm']) };
  return { kind: 'site', url: recordableAddress(input.url ?? '', ownPort).href };
}
