import { createHash } from 'node:crypto';
import { normalizeAnswer, type QuestionKind } from '../connectors/ask.ts';
import type { JsonValue } from '../connector-call.ts';

// Canonical object keys, exact strings and ordered arrays (ADR0042). This only receives validated values,
// never parses arbitrary tool output or text, and is a retry identifier rather than a secret-hiding guarantee.
function canonical(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
    return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** First application must additionally call checkedAnswer with the current question to validate choice membership. */
export function answerFingerprint(kind: QuestionKind, answer: unknown): string {
  return createHash('sha256').update(canonical(normalizeAnswer(kind, answer))).digest('hex');
}
