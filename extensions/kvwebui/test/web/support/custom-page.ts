import type { Json } from '@kvman/sdk';
import type { Kvman } from '@kvman/sdk/web';
import { inject } from 'vue';
import type { FakeApi } from './fake-api.ts';
import { notesApi, notesUi } from './notes.ts';

// Custom-component fixtures: the `notes` extension whose page `custom` shows a given view, beside its `note` page, its
// `help` panel, and its status item; and the injected `kvman` for fixture components.

export function useKvman(): Kvman {
  const kvman = inject<Kvman>('kvman');
  if (kvman === undefined) throw new Error('No kvman was provided.');
  return kvman;
}

export const custom = (component: string, props: Record<string, Json> = {}): Json => ({ type: 'custom', component, props });

export const stack = (...children: Json[]): Json => ({ type: 'stack', direction: 'vertical', children });

export const notesTable: Json = { type: 'table', query: 'notes.note.list', input: {}, columns: [{ field: 'title', title: 'notes.columns.title' }] };

export function customApi(view: Json, params?: string[]): FakeApi {
  const page = { id: 'custom', title: 'notes.pages.list', ...(params === undefined ? {} : { params }), view };
  const note = { id: 'note', title: 'notes.pages.note', params: ['noteId'], view: { type: 'text', text: 'notes.note.showing', params: { id: { $param: 'noteId' } } } };
  const api = notesApi({ ui: notesUi({ pages: [page, note], nav: [] }) });
  api.catalogs['en'] = { ...api.catalogs['en'], 'notes.saved': 'Saved {name}.', 'notes.hello': 'Hello.', 'notes.first': 'First.', 'notes.after': 'After.', 'notes.errors.NOPE': 'Nope.' };
  return api;
}
