import type { Json } from '@kvman/sdk';
import { describe, expect, it } from 'vitest';
import { fail } from './support/fake-api.ts';
import { button, click, extension, mountApp, type } from './support/mount-app.ts';
import { notesApi, notesUi } from './support/notes.ts';

const pageWith = (id: string, view: Json, params?: string[]): Json => ({ id, title: 'notes.pages.list', ...(params === undefined ? {} : { params }), view });

describe('forms (06 §6.4, §6.7, ADR 0009, 70–71)', () => {
  it('M2.2-H3 forms come from JSON Schema, and a failed command marks fields', async () => {
    const api = notesApi({ ui: notesUi({ pages: [pageWith('list', { type: 'form', command: 'notes.note.add', fixed: { folder: 'inbox' }, submit: 'notes.done' })] }) });
    api.catalogs['en'] = { ...api.catalogs['en'], 'notes.note.add.fields.title': 'Title' };
    api.handlers.set('notes.note.add', () => fail('VALIDATION_FAILED', { issues: [{ path: 'title', message: 'Too short' }, { path: 'nowhere', message: 'Odd' }] }));
    const app = await mountApp(api, '/notes/list');
    const form = app.find('[data-test="form-notes.note.add"]');
    const field = (path: string) => form?.querySelector<HTMLElement>(`[data-field="${path}"]`) ?? null;
    expect([...(form?.querySelectorAll<HTMLElement>('[data-field]') ?? [])].map((element) => element.dataset['field'])).toEqual(['title', 'pages', 'pinned', 'color', 'due', 'tags', 'meta.author', 'token', 'extra']);
    expect(field('title')?.querySelector('input')?.type).toBe('text');
    expect(field('title')?.querySelector('label')?.textContent).toContain('Title');
    expect(field('pages')?.querySelector('input')?.type).toBe('number');
    expect(field('pages')?.querySelector('label')?.textContent).toContain('How many pages.');
    expect(field('pinned')?.querySelector('input')?.type).toBe('checkbox');
    expect([...(field('color')?.querySelectorAll('option') ?? [])].map((option) => option.textContent)).toEqual(['None', 'red', 'blue']);
    expect(field('due')?.querySelector('input')?.type).toBe('text');
    expect(field('tags')?.querySelector('textarea')).not.toBeNull();
    expect(form?.querySelector('fieldset legend')?.textContent).toBe('meta');
    expect(field('token')?.querySelector('input')?.type).toBe('password');
    expect(field('extra')?.querySelector('textarea')).not.toBeNull();
    await type(field('title')?.querySelector('input') ?? null, 'x');
    await click(button(app, 'Done.'));
    expect(api.callsTo('notes.note.add')[0]?.input).toMatchObject({ folder: 'inbox', title: 'x', pinned: false, due: null });
    expect(field('title')?.dataset['invalid']).toBe('true');
    expect(field('title')?.querySelector('[data-test="field-invalid"]')?.textContent).toBe("This value isn't valid.");
    expect(field('pages')?.dataset['invalid']).toBe('false');
    const toast = app.find('[data-level="error"]');
    expect(toast?.textContent).toContain("Something isn't valid.");
    expect(toast?.textContent).toContain('Check the marked fields.');
  });

  it('M2.2-E11 fixed values take references, a union gives one form, filled fields are sent, and the form clears', async () => {
    const union = { anyOf: [{ type: 'object', properties: { id: { type: 'string' }, api: { type: 'string' }, baseUrl: { type: 'string' } }, required: ['id', 'api', 'baseUrl'] }, { type: 'object', properties: { id: { type: 'string' }, delegate: { type: 'string' } }, required: ['id', 'delegate'] }] };
    const api = notesApi({
      ui: notesUi({
        pages: [
          pageWith('note', { type: 'form', command: 'notes.note.add', fixed: { folder: { $param: 'noteId' } }, submit: 'notes.done' }, ['noteId']),
          pageWith('provider', { type: 'form', command: 'union.add', submit: 'notes.pages.note' }),
        ],
        nav: [],
      }),
    });
    api.extensions.push(extension('union', { commands: [{ name: 'union.add', input: union }] }));
    api.handlers.set('union.ui.get', () => ({ pages: [], nav: [], panels: [], status: [] }));
    api.handlers.set('union.add', () => ({}));
    const app = await mountApp(api, '/notes/note/n1');
    const title = app.find('[data-field="title"] input');
    await type(title, 'Hello');
    await click(button(app, 'Done.'));
    expect(api.callsTo('notes.note.add')[0]?.input).toMatchObject({ folder: 'n1', title: 'Hello' });
    expect(app.find<HTMLInputElement>('[data-field="title"] input')?.value).toBe('');
    await app.router.push('/notes/provider');
    await app.settle();
    const fields = app.findAll('[data-field]');
    expect(fields.map((field) => [field.dataset['field'], field.dataset['required']])).toEqual([['id', 'true'], ['api', 'false'], ['baseUrl', 'false'], ['delegate', 'false']]);
    await type(app.find('[data-field="id"] input'), 'local');
    await type(app.find('[data-field="delegate"] input'), 'relay.run');
    await click(button(app, 'Note'));
    expect(api.callsTo('union.add')[0]?.input).toEqual({ id: 'local', delegate: 'relay.run' });
  });
});
