import { compareByCodePoint, readPath, type Json, type JsonObject } from '@kvman/protocol';

function rankOf(value: unknown): number {
  if (value === undefined || value === null) return 0;
  if (value === false) return 1;
  if (value === true) return 2;
  if (typeof value === 'number') return 3;
  if (typeof value === 'string') return 4;
  return 5;
}

function compareValues(left: unknown, right: unknown): number {
  const rank = rankOf(left) - rankOf(right);
  if (rank !== 0) return rank;
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  if (typeof left === 'string' && typeof right === 'string') return compareByCodePoint(left, right);
  return 0;
}

export type OrderedDocument = { id: string; data: JsonObject };

export function compareDocuments(orderBy: ReadonlyArray<readonly [string, 'asc' | 'desc']>): (left: OrderedDocument, right: OrderedDocument) => number {
  return (left, right) => {
    for (const [path, direction] of orderBy) {
      const order = compareValues(readPath(left.data, path), readPath(right.data, path));
      if (order !== 0) return direction === 'asc' ? order : -order;
    }
    return compareByCodePoint(left.id, right.id);
  };
}

export function jsonOf(text: unknown): Json {
  return JSON.parse(String(text)) as Json;
}
