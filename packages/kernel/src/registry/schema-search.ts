export type Searchable = { name: string; description: string };

function byName(left: Searchable, right: Searchable): number {
  if (left.name === right.name) return 0;
  return left.name < right.name ? -1 : 1;
}

function scoreOf(entry: Searchable, query: string, words: readonly string[]): number | undefined {
  const name = entry.name.toLowerCase();
  const description = entry.description.toLowerCase();
  if (!words.every((word) => name.includes(word) || description.includes(word))) return undefined;
  const exact = name === query ? 100 : 0;
  const prefix = exact === 0 && name.startsWith(query) ? 50 : 0;
  const inName = words.filter((word) => name.includes(word)).length * 10;
  const inDescription = words.filter((word) => description.includes(word)).length;
  return exact + prefix + inName + inDescription;
}

// ADR 0112: without `q`, every entry sorted by name; with it, only entries holding every word of `q` in their name
// or description, ranked by an exact name, a name prefix, words in the name, and words in the description.
export function searchEntries<Entry>(entries: readonly Entry[], q: string | undefined, searchable: (entry: Entry) => Searchable): Entry[] {
  const keyed = entries.map((entry) => ({ entry, key: searchable(entry) }));
  if (q === undefined) return keyed.sort((left, right) => byName(left.key, right.key)).map(({ entry }) => entry);
  const query = q.trim().toLowerCase();
  const words = query.split(/\s+/);
  return keyed
    .flatMap(({ entry, key }) => {
      const score = scoreOf(key, query, words);
      return score === undefined ? [] : [{ entry, key, score }];
    })
    .sort((left, right) => right.score - left.score || byName(left.key, right.key))
    .map(({ entry }) => entry);
}
