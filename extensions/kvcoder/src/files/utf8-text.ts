import { invalid } from '../problems.ts';

// A file's bytes as text for an edit (plan 08 §8.5): only valid UTF-8 is edited.

const strictText = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

export function textOf(bytes: Buffer, requested: string): string {
  try {
    return strictText.decode(bytes);
  } catch {
    throw invalid(`${requested} isn't valid UTF-8 text, so it isn't edited.`, { path: requested });
  }
}
