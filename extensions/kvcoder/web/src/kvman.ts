import { inject } from 'vue';
import type { Kvman } from '@kvman/sdk/web';
import type {} from '../../src/index.ts';

// kvcoder's components read kvwebui's `kvman` (plan 06 §6.4) and translate what kvcoder stores.

export function useKvman(): Kvman {
  const kvman = inject<Kvman>('kvman');
  if (kvman === undefined) throw new Error('kvcoder components run inside kvwebui, which provides kvman.');
  return kvman;
}

export type Translate = Kvman['t'];

/** The language kvwebui set on the page (ADR 0009, 132); formats follow it, not the browser's. */
export const pageLanguage = (): string | undefined => (document.documentElement.lang === '' ? undefined : document.documentElement.lang);

/** The fields of a JSON object, or none for anything else. */
export function fields(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : {};
}

/** A session title: a string, or a translation key; an empty one is a new chat. */
export function titleText(t: Translate, title: string | { key: string }): string {
  if (typeof title !== 'string') return t(title.key);
  return title === '' ? t('kvcoder.ui.newChat') : title;
}

/** The translation key of a Problem's text (plan 05). */
export function problemKey(code: string): string {
  const slash = code.indexOf('/');
  return slash < 0 ? `kernel.errors.${code}` : `${code.slice(0, slash)}.errors.${code.slice(slash + 1)}`;
}

export type ShownProblem = { code: string; params: Record<string, string> };

/** The code and params (as strings) of a Problem a call rejected with, if it is one. */
export function problemOf(error: unknown): ShownProblem | undefined {
  if (!(error instanceof Error) || !('problem' in error)) return undefined;
  const problem = error.problem;
  if (typeof problem !== 'object' || problem === null || !('code' in problem) || typeof problem.code !== 'string') return undefined;
  return { code: problem.code, params: stringValues('params' in problem ? problem.params : undefined) };
}

/** The fields of a JSON object as strings (what a translation takes), or none for anything else. */
export function stringValues(params: unknown): Record<string, string> {
  return Object.fromEntries(Object.entries(fields(params)).map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)]));
}

/** Shows a failed call as a toast. */
export function toastProblem(kvman: Kvman, error: unknown): void {
  const problem = problemOf(error);
  kvman.toast(problem === undefined ? 'kvcoder.ui.failed' : problemKey(problem.code), problem?.params ?? {}, 'error');
}

/** US dollars in the UI language: two decimals, four under one cent, one significant digit under 0.0001 (ADR 0009, 147). */
export function formatCost(amount: number): string {
  const currency = { style: 'currency', currency: 'USD' } as const;
  if (amount === 0 || amount >= 0.01) return new Intl.NumberFormat(pageLanguage(), currency).format(amount);
  return new Intl.NumberFormat(pageLanguage(), amount < 0.0001 ? { ...currency, maximumSignificantDigits: 1 } : { ...currency, minimumFractionDigits: 4 }).format(amount);
}

/** Tokens, cost, and time, in the UI language. */
export function totals(t: Translate, usage: { input: number; output: number; cost: number }, durationMs: number): string {
  const tokens = new Intl.NumberFormat(pageLanguage(), { notation: 'compact', maximumFractionDigits: 1 }).format(usage.input + usage.output);
  const cost = formatCost(usage.cost);
  const seconds = Math.round(durationMs / 1000);
  const time = seconds < 60 ? t('kvcoder.ui.seconds', { count: seconds }) : t('kvcoder.ui.minutes', { count: Math.round(seconds / 60) });
  return t('kvcoder.ui.totals', { time, tokens, cost });
}
