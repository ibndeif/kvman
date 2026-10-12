import type { FindOptions, Stored } from '@kvman/sdk';

// Every record of a collection that can grow without limit (ADR 0057, 1): read in pages, each from the last id of the
// one before, so a list, an export, or a cleanup never stops at the first thousand.

const pageSize = 1000;

/** All the records `find` gives, in `order`. */
export async function allDocs<Doc>(find: (options: FindOptions) => Promise<Stored<Doc>[]>, order: 'asc' | 'desc' = 'asc'): Promise<Stored<Doc>[]> {
  const found: Stored<Doc>[] = [];
  for (let page = await find({ limit: pageSize, order }); page.length > 0; page = await find({ limit: pageSize, order, after: found.at(-1)?.id ?? '' })) {
    found.push(...page);
    if (page.length < pageSize) break;
  }
  return found;
}
