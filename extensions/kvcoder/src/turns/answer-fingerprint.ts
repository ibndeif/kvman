import { createHash } from 'node:crypto';
import { normalizeAnswer, type QuestionKind } from '../connectors/ask.ts';
import type { JsonValue } from '../connector-call.ts';
import type { AnswerExtras } from './answer-extras.ts';

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

/**
 * First application must additionally call checkedAnswer with the current question to validate choice membership. An
 * answer with a rule or a reason covers them too; one without has the fingerprint receipts had before (ADR 0091, 4).
 */
export function answerFingerprint(kind: QuestionKind, answer: unknown, extras: AnswerExtras = {}): string {
  const normalized = normalizeAnswer(kind, answer);
  const extra = { ...(extras.remember === undefined ? {} : { remember: extras.remember }), ...(extras.reason === undefined ? {} : { reason: extras.reason }) };
  const covered: JsonValue = Object.keys(extra).length === 0 ? normalized : { answer: normalized, ...extra };
  return createHash('sha256').update(canonical(covered)).digest('hex');
}
