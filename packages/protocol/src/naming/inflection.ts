import { baseByParticiple, baseFormParticiples, participleByBase } from './irregular-participles.ts';

const vowels = 'aeiou';
const baseVerbsEndingInEd: ReadonlySet<string> = new Set(['embed', 'shred']);
const silentEStemEndings = [
  'at', 'ut', 'et', 'v', 'iz', 'yz', 'ac', 'ic', 'uc', 'rg', 'dg', 'ag', 'ang', 'os', 'us', 'is', 'as', 'rs',
  'ur', 'id', 'ud', 'od', 'bl', 'pl', 'dl', 'gl', 'tl', 'kl', 'fl', 'cl',
];

function endsWithConsonantY(word: string): boolean {
  const beforeY = word.at(-2);
  return word.endsWith('y') && beforeY !== undefined && !vowels.includes(beforeY);
}

export function isPastParticiple(word: string): boolean {
  return (word.length > 2 && word.endsWith('ed')) || baseByParticiple.has(word);
}

export function readsAsPastParticiple(verb: string): boolean {
  if (baseFormParticiples.has(verb) || baseVerbsEndingInEd.has(verb) || verb.endsWith('eed')) return false;
  return isPastParticiple(verb);
}

export function toPastParticiple(verb: string): string {
  const irregular = participleByBase.get(verb);
  if (irregular !== undefined) return irregular;
  if (verb.endsWith('e')) return `${verb}d`;
  if (endsWithConsonantY(verb)) return `${verb.slice(0, -1)}ied`;
  return `${verb}ed`;
}

export function toBaseVerb(participle: string): string {
  const irregular = baseByParticiple.get(participle);
  if (irregular !== undefined) return irregular;
  if (participle.endsWith('ied')) return `${participle.slice(0, -3)}y`;
  if (!participle.endsWith('ed')) return participle;
  const stem = participle.slice(0, -2);
  return silentEStemEndings.some((ending) => stem.endsWith(ending)) ? `${stem}e` : stem;
}
