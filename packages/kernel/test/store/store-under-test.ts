import { z } from '@kvman/sdk';
import { createStore } from '../../src/store/store.ts';
import type { TestHome } from '../temporary-home.ts';

export const note = z.object({ text: z.string(), done: z.boolean().optional(), rank: z.number().optional(), tag: z.string().nullable().optional() });

export function storeOf(test: TestHome, extension = '@test/notes', workspaceId = 'home') {
  return createStore(test.connection, { extension, workspaceId }, test.ids);
}

