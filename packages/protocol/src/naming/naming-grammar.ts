import { isPastParticiple, readsAsPastParticiple, toBaseVerb, toPastParticiple } from './inflection.ts';
import { errorCodePattern, segmentPattern } from './name-patterns.ts';

export type NameFinding = { rule: 'format' | 'grammar'; message: string; hint?: string };

export type TypeKind = 'command' | 'query' | 'event';

export const readVerbs: readonly string[] = ['get', 'list', 'search', 'count', 'preview', 'validate'];

const readVerbList = readVerbs.join(', ');

function splitName(name: string): { segments: string[]; lastWords: string[] } {
  const segments = name.split('.');
  return { segments, lastWords: (segments.at(-1) ?? '').split('-') };
}

function withLastSegmentWords(name: string, words: string[]): string {
  const segments = name.split('.');
  return [...segments.slice(0, -1), words.join('-')].join('.');
}

export function checkDottedName(name: string): NameFinding[] {
  const { segments } = splitName(name);
  if (segments.length < 2) {
    return [{ rule: 'format', message: `"${name}" needs a namespace and at least one more segment`, hint: 'names look like "<namespace>.<name>", e.g. "pdf.translate"' }];
  }
  const findings: NameFinding[] = [];
  const namespace = segments[0] ?? '';
  if (namespace.length < 2 || namespace.length > 32) {
    findings.push({ rule: 'format', message: `the namespace "${namespace}" must be 2–32 characters long` });
  }
  for (const segment of segments) {
    if (!segmentPattern.test(segment)) {
      findings.push({ rule: 'format', message: `the segment "${segment}" is not lowercase kebab-case`, hint: 'use lowercase words of letters and digits joined by "-", e.g. "set-model"' });
    }
  }
  return findings;
}

function checkQueryGrammar(name: string, lastWords: string[]): NameFinding[] {
  if (lastWords.length === 1 && readVerbs.includes(lastWords[0] ?? '')) return [];
  return [{ rule: 'grammar', message: `query names end in a read verb (${readVerbList})`, hint: `rename "${name}" to end in one of them` }];
}

function checkEventGrammar(name: string, lastWords: string[]): NameFinding[] {
  const lastWord = lastWords.at(-1) ?? '';
  if (isPastParticiple(lastWord)) return [];
  const suggestion = withLastSegmentWords(name, [...lastWords.slice(0, -1), toPastParticiple(lastWord)]);
  return [{ rule: 'grammar', message: 'event names end in a past participle', hint: `did you mean "${suggestion}"?` }];
}

function checkCommandGrammar(name: string, lastWords: string[]): NameFinding[] {
  const [verb = '', ...rest] = lastWords;
  if (readVerbs.includes(verb)) {
    return [{ rule: 'grammar', message: 'command names end in an imperative verb, never a read verb', hint: 'a command that only reads is a query' }];
  }
  if (!readsAsPastParticiple(verb)) return [];
  const suggestion = withLastSegmentWords(name, [toBaseVerb(verb), ...rest]);
  return [{ rule: 'grammar', message: 'command names end in an imperative verb', hint: `did you mean "${suggestion}"?` }];
}

const grammarByKind: Record<TypeKind, (name: string, lastWords: string[]) => NameFinding[]> = {
  command: checkCommandGrammar,
  query: checkQueryGrammar,
  event: checkEventGrammar,
};

export function checkTypeName(name: string, kind: TypeKind): NameFinding[] {
  const formatFindings = checkDottedName(name);
  if (formatFindings.length > 0) return formatFindings;
  return grammarByKind[kind](name, splitName(name).lastWords);
}

export function checkLiveAddress(address: string): NameFinding[] {
  const separator = address.indexOf(':');
  if (separator === -1 || separator === address.length - 1) {
    return [{ rule: 'format', message: `"${address}" is not a live event address`, hint: 'live events are addressed as "<event type>:<key>", e.g. "agent.tokens.generated:<sessionId>"' }];
  }
  return checkTypeName(address.slice(0, separator), 'event');
}

export function checkErrorCode(code: string): NameFinding[] {
  if (errorCodePattern.test(code)) return [];
  return [{ rule: 'format', message: `"${code}" is not an extension error code`, hint: 'error codes are "<namespace>/UPPER_SNAKE", e.g. "pdf/NOT_FOUND"' }];
}
