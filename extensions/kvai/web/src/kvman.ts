import { inject } from 'vue';
import type { Kvman } from '@kvman/sdk/web';

// kvai's components read kvwebui's `kvman` (plan 06 §6.4) and translate Problems by code.
export function useKvman(): Kvman {
  const kvman = inject<Kvman>('kvman');
  if (kvman === undefined) throw new Error('kvai components run inside kvwebui, which provides kvman.');
  return kvman;
}

export type Translate = Kvman['t'];

/** The translation key of a Problem's text (plan 05). */
export function problemKey(code: string): string {
  const slash = code.indexOf('/');
  return slash < 0 ? `kernel.errors.${code}` : `${code.slice(0, slash)}.errors.${code.slice(slash + 1)}`;
}

export type ShownProblem = { code: string; params: Record<string, string> };

/** The fields of a JSON object, or none for anything else. */
export function fields(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value));
}

/** The fields of a JSON object as strings (what a translation takes), or none for anything else. */
export function stringValues(params: unknown): Record<string, string> {
  return Object.fromEntries(Object.entries(fields(params)).map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)]));
}

/** The code and params (as strings) of a Problem a call rejected with, if it is one. */
export function problemOf(error: unknown): ShownProblem | undefined {
  if (!(error instanceof Error) || !('problem' in error)) return undefined;
  const problem = fields(error.problem);
  const code = problem['code'];
  if (typeof code !== 'string') return undefined;
  return { code, params: stringValues(problem['params']) };
}

/** The text key and params to show for an error a call rejected with; anything that isn't a Problem is a general failure. */
export function failureOf(error: unknown): { key: string; params: Record<string, string> } {
  const shown = problemOf(error);
  return shown === undefined ? { key: 'kvai.ui.connection.failed', params: {} } : { key: problemKey(shown.code), params: shown.params };
}
