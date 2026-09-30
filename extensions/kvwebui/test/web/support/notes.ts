import type { Json } from '@kvman/sdk';
import { createFakeApi, type FakeApi } from './fake-api.ts';
import { extension } from './mount-app.ts';

// The `notes` fixture extension: a list page, a note page with a param, a nav item, a panel, and a status item, with
// queries and commands the tests can replace.

export const notesRows = [
  { id: 'n1', title: 'First', pages: 3 },
  { id: 'n2', title: 'Second', pages: 1 },
  { id: 'n3', title: 'Third', pages: 12 },
];

export const noteAddInput = {
  type: 'object',
  properties: {
    folder: { type: 'string' },
    title: { type: 'string', minLength: 1 },
    pages: { type: 'integer', description: 'How many pages.' },
    pinned: { type: 'boolean' },
    color: { type: 'string', enum: ['red', 'blue'] },
    due: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    tags: { type: 'array', items: { type: 'string' } },
    meta: { type: 'object', properties: { author: { type: 'string' } }, required: ['author'] },
    token: { type: 'string', writeOnly: true },
    extra: { type: 'object', propertyNames: { type: 'string' }, additionalProperties: {} },
  },
  required: ['folder', 'title'],
};

export function notesUi(overrides: Record<string, Json> = {}): Json {
  return {
    pages: [
      {
        id: 'list',
        title: 'notes.pages.list',
        view: {
          type: 'stack',
          direction: 'vertical',
          children: [
            { type: 'heading', text: 'notes.pages.list', level: 1 },
            { type: 'table', query: 'notes.note.list', input: {}, columns: [{ field: 'title', title: 'notes.columns.title' }, { field: 'pages', title: 'notes.columns.pages', format: 'number' }] },
          ],
        },
      },
      { id: 'note', title: 'notes.pages.note', params: ['noteId'], view: { type: 'text', text: 'notes.note.showing', params: { id: { $param: 'noteId' } } } },
    ],
    nav: [{ id: 'list', page: 'list', title: 'notes.nav.list', icon: 'notebook', order: 10 }],
    panels: [{ id: 'help', title: 'notes.panels.help', icon: 'circle-question-mark', view: { type: 'text', text: 'notes.help.body' } }],
    status: [{ id: 'count', query: 'notes.count.get', input: {}, text: 'notes.status.count', params: { count: { $output: 'count' } }, order: 1 }],
    ...(overrides as Record<string, Json>),
  };
}

export const notesCatalog: Record<string, string> = {
  'notes.pages.list': 'Notes',
  'notes.pages.note': 'Note',
  'notes.nav.list': 'Notes',
  'notes.panels.help': 'Help',
  'notes.help.body': 'Notes keep your thoughts.',
  'notes.status.count': '{count} notes',
  'notes.columns.title': 'Title',
  'notes.columns.pages': 'Pages',
  'notes.note.showing': 'Showing note {id}',
  'notes.app.title': 'Notes App',
  'notes.done': 'Done.',
  'notes.errors.LOCKED': '{name} is locked.',
  'notes.errors.DOWN': 'Notes are down.',
};

export function notesExtension(): ReturnType<typeof extension> {
  return extension('notes', {
    queries: [{ name: 'notes.note.list' }, { name: 'notes.count.get' }, { name: 'notes.note.get' }, { name: 'notes.secret.get', public: false }],
    commands: [{ name: 'notes.note.add', input: noteAddInput }, { name: 'notes.note.create' }, { name: 'notes.note.delete' }, { name: 'notes.lock' }],
  });
}

export function notesApi(options: { home?: string; ui?: Json } = {}): FakeApi {
  const api = createFakeApi({ home: options.home ?? 'notes.list', extensions: [notesExtension()], catalogs: { en: notesCatalog, ar: notesCatalog } });
  api.handlers.set('notes.ui.get', () => options.ui ?? notesUi());
  api.handlers.set('notes.note.list', () => notesRows);
  api.handlers.set('notes.count.get', () => ({ count: 3 }));
  api.handlers.set('notes.note.create', () => ({ id: 'n7' }));
  api.handlers.set('notes.note.delete', () => ({}));
  api.handlers.set('notes.note.add', () => ({}));
  return api;
}
