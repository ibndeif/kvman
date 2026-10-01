import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from '@kvman/sdk';
import type { CheckedFinding } from './finding.ts';

// Missing locale keys (plan 02 §2.11, ADR 0009, 116): a key one shipped catalog has and another lacks, and each key
// the extension needs (its ui.get texts, `<namespace>.title`, each setting's `<key>.title`) missing from a catalog.
// `en` always counts as shipped, since it's the fallback of every language.

export type RequiredKey = { key: string; usedBy: string };

const catalogSchema = z.record(z.string(), z.string());

const hint = {
  parity: 'Add the key to every catalog, so each language shows the same texts.',
  required: 'Add the key to every catalog; without it the UI shows the key itself.',
};

function catalogs(folder: string): Map<string, ReadonlySet<string>> {
  const found = new Map<string, ReadonlySet<string>>([['en', new Set()]]);
  const locales = path.join(folder, 'locales');
  if (!existsSync(locales)) return found;
  for (const file of readdirSync(locales).filter((name) => name.endsWith('.json')).sort()) {
    const keys = Object.keys(catalogSchema.parse(JSON.parse(readFileSync(path.join(locales, file), 'utf8'))));
    found.set(file.slice(0, -'.json'.length), new Set(keys));
  }
  return found;
}

export function localeFindings(folder: string, required: readonly RequiredKey[]): CheckedFinding[] {
  const shipped = catalogs(folder);
  const everyKey = [...new Set([...shipped.values()].flatMap((keys) => [...keys]))].sort();
  const findings: CheckedFinding[] = [];
  for (const [language, keys] of shipped) {
    const file = `locales/${language}.json`;
    for (const key of everyKey.filter((candidate) => !keys.has(candidate))) {
      const holders = [...shipped].filter(([, other]) => other.has(key)).map(([other]) => `locales/${other}.json`);
      findings.push({ file, message: `${file} lacks ${key}, which ${holders.join(' and ')} has.`, hint: hint.parity, warning: false });
    }
    const seen = new Set<string>();
    for (const { key, usedBy } of required) {
      if (seen.has(key) || everyKey.includes(key)) continue;
      seen.add(key);
      findings.push({ file, message: `${file} lacks ${key} (used by ${usedBy}).`, hint: hint.required, warning: false });
    }
  }
  return findings;
}
