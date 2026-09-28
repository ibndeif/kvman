import type { Catalog, Translations } from '@kvman/protocol';

// A key names a message by its dotted path in a nested catalog (08 §8.16).
export function messageAt(catalog: Catalog | undefined, key: string): string | undefined {
  let node: Catalog | string | undefined = catalog;
  for (const segment of key.split('.')) {
    if (node === undefined || typeof node === 'string') return undefined;
    node = node[segment];
  }
  return typeof node === 'string' ? node : undefined;
}

// Every message of a catalog with its dotted key, in the catalog's order.
export function catalogMessages(catalog: Catalog, prefix = ''): Array<[key: string, message: string]> {
  return Object.entries(catalog).flatMap(([segment, node]): Array<[string, string]> => {
    const key = prefix === '' ? segment : `${prefix}.${segment}`;
    return typeof node === 'string' ? [[key, node]] : catalogMessages(node, key);
  });
}

// 08 §8.16: the exact tag, its base language, then the owner's default locale; only shipped catalogs, each once.
export function fallbackChain(translations: Translations, locale: string): string[] {
  const base = locale.split('-')[0] ?? locale;
  return [...new Set([locale, base, translations.default])].filter((candidate) => translations.catalogs[candidate] !== undefined);
}
