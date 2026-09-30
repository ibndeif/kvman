import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from '@kvman/sdk';
import { kernelProblem } from '../problems.ts';
import { kernelExtension } from '../settings/kernel-settings.ts';

// Locale catalogs (plan 02 §2.11, ADR 0009, 25 and 31): each owner's `locales/<lang>.json` is a flat object of strings,
// every key under its namespace. A language's catalog is `en` overlaid with that language.

export type Catalog = Record<string, string>;

// One owner's catalogs by language.
export type OwnerCatalogs = ReadonlyMap<string, Catalog>;

export type CatalogOwner = { name: string; namespace: string; folder: string };

const catalogSchema = z.record(z.string(), z.string());

export const kernelCatalogOwner: CatalogOwner = {
  name: kernelExtension,
  namespace: 'kernel',
  folder: fileURLToPath(new URL('../..', import.meta.url)),
};

function invalid(owner: CatalogOwner, message: string): Error {
  return kernelProblem('EXTENSION_INVALID', `${owner.name}: ${message}`, { extension: owner.name });
}

function languageOf(owner: CatalogOwner, file: string): string {
  const code = file.slice(0, -'.json'.length);
  try {
    Intl.getCanonicalLocales(code);
  } catch {
    throw invalid(owner, `locales/${file} isn't named after a language code (BCP 47).`);
  }
  return code;
}

function readCatalog(owner: CatalogOwner, file: string): Catalog {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path.join(owner.folder, 'locales', file), 'utf8'));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw invalid(owner, `locales/${file} can't be read (${reason}).`);
  }
  const catalog = catalogSchema.safeParse(parsed);
  if (!catalog.success) throw invalid(owner, `locales/${file} must be a flat object of strings.`);
  const outside = Object.keys(catalog.data).find((key) => !key.startsWith(`${owner.namespace}.`));
  if (outside !== undefined) throw invalid(owner, `locales/${file} has the key "${outside}", outside the namespace "${owner.namespace}".`);
  return catalog.data;
}

export function readOwnerCatalogs(owner: CatalogOwner): OwnerCatalogs {
  const folder = path.join(owner.folder, 'locales');
  if (!existsSync(folder)) return new Map();
  const files = readdirSync(folder).filter((file) => file.endsWith('.json'));
  return new Map(files.map((file) => [languageOf(owner, file), readCatalog(owner, file)]));
}

export type Catalogs = { languages: string[]; catalog(language: string): Catalog };

export function mergeCatalogs(owners: Iterable<OwnerCatalogs>): Catalogs {
  const merged = new Map<string, Catalog>();
  for (const catalogs of owners) {
    for (const [language, catalog] of catalogs) merged.set(language, { ...merged.get(language), ...catalog });
  }
  return {
    languages: [...merged.keys()].sort(),
    catalog(language) {
      const own = merged.get(language);
      if (own === undefined) throw kernelProblem('NOT_FOUND', `No loaded catalog has the language "${language}".`, { language });
      return { ...merged.get('en'), ...own };
    },
  };
}
