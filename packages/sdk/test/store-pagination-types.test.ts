import { describe, expectTypeOf, it } from 'vitest';
import type { Collection, FindOptions, Stored, TransactionCollection } from '../src/index.ts';

type Note = { text: string };

describe('collection continuation types (03 §3.4, ADR0040)', () => {
  it('M1.2-E19 after is optional and ordinary/transaction result shapes stay unchanged', () => {
    expectTypeOf<FindOptions>().toEqualTypeOf<{ limit: number; order?: 'asc' | 'desc'; after?: string }>();
    expectTypeOf<Collection<Note>['find']>().parameter(1).toEqualTypeOf<FindOptions>();
    expectTypeOf<TransactionCollection<Note>['find']>().parameter(1).toEqualTypeOf<FindOptions>();
    expectTypeOf<Collection<Note>['find']>().returns.toEqualTypeOf<Promise<Stored<Note>[]>>();
    expectTypeOf<TransactionCollection<Note>['find']>().returns.toEqualTypeOf<Stored<Note>[]>();
  });
});
