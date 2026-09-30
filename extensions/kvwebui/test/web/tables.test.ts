import type { Json } from '@kvman/sdk';
import { describe, expect, it } from 'vitest';
import { createFakeApi, fail } from './support/fake-api.ts';
import { button, click, extension, mountApp, type Mounted } from './support/mount-app.ts';

const when = '2026-09-30T10:05:00.000Z';
const rows = [
  { id: 'a1', name: 'Alpha', code: 'alpha-1', size: 1234567, when, bytes: 1536, done: true, note: null, meta: { k: 1 }, status: 'ready' },
  { id: 'b2', name: 'Beta', code: 'beta-2', size: 2, when, bytes: 10, done: false, note: 'n', meta: [], status: 'other' },
];
const many = Array.from({ length: 42 }, (_, index) => ({ id: `m${String(index)}`, name: index === 41 ? 'Needle' : `Row ${String(index)}` }));

const card = (title: string, query: string, extra: Record<string, Json> = {}): Json => ({
  type: 'card',
  title,
  children: [{ type: 'table', query, input: {}, columns: [{ field: 'name', title: 'grid.name' }], ...extra }],
});

const columns = [
  { field: 'name', title: 'grid.name', secondary: 'code' },
  { field: 'size', title: 'grid.size', format: 'number' },
  { field: 'when', title: 'grid.when', format: 'date' },
  { field: 'bytes', title: 'grid.bytes', format: 'bytes' },
  { field: 'done', title: 'grid.done', format: 'boolean' },
  { field: 'note', title: 'grid.note' },
  { field: 'meta', title: 'grid.meta' },
  { field: 'status', title: 'grid.status', badges: { ready: { text: 'grid.ready', tone: 'success' } } },
];

function gridApi(): { api: ReturnType<typeof createFakeApi>; releaseSlow: () => void } {
  const queries = ['grid.rows.get', 'grid.many.get', 'grid.none.get', 'grid.slow.get', 'grid.down.get'].map((name) => ({ name }));
  const catalog = { 'grid.name': 'Name', 'grid.ready': 'Ready', 'grid.nothing': 'No rows here.', 'grid.page': 'Grid', 'notes.pages.note': 'Note', 'notes.errors.DOWN': 'Down.' };
  const api = createFakeApi({ home: 'grid.page', extensions: [extension('grid', { queries })], catalogs: { en: catalog } });
  let releaseSlow = (): void => undefined;
  const slow = new Promise<Json>((resolve) => {
    releaseSlow = () => resolve([{ name: 'Late' }]);
  });
  const view = {
    type: 'stack',
    direction: 'vertical',
    children: [
      card('grid.rows', 'grid.rows.get', { columns, rowLink: { page: 'grid.item', params: { itemId: { $row: 'id' } } } }),
      card('grid.many', 'grid.many.get'),
      card('grid.empty', 'grid.none.get', { empty: 'grid.nothing' }),
      card('grid.default', 'grid.none.get'),
      card('grid.slow', 'grid.slow.get'),
      card('grid.down', 'grid.down.get'),
    ],
  };
  api.handlers.set('grid.ui.get', () => ({ pages: [{ id: 'page', title: 'grid.page', view }, { id: 'item', title: 'notes.pages.note', params: ['itemId'], view: { type: 'text', text: 'grid.item' } }], nav: [], panels: [], status: [] }));
  api.handlers.set('grid.rows.get', () => rows);
  api.handlers.set('grid.many.get', () => many);
  api.handlers.set('grid.none.get', () => []);
  api.handlers.set('grid.slow.get', () => slow);
  api.handlers.set('grid.down.get', () => fail('notes/DOWN'));
  return { api, releaseSlow };
}

const section = (app: Mounted, title: string): HTMLElement | undefined => app.findAll('section').find((candidate) => candidate.querySelector('h2')?.textContent === title);

describe('tables (06 §6.4, ADR 0009, 75–76)', () => {
  it('M2.2-E9 formats, badges, row links, search, "Show more", empty text, loading, and failures', async () => {
    const { api, releaseSlow } = gridApi();
    const app = await mountApp(api, '/');
    const cells = [...(section(app, 'grid.rows')?.querySelectorAll('[data-test="table-row"]')[0]?.querySelectorAll('td') ?? [])].map((cell) => cell.textContent.trim());
    const date = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(when));
    expect(cells.slice(0, 8)).toEqual(['Alphaalpha-1', '1,234,567', date, '1.5 KB', 'Yes', '—', '{"k":1}', 'Ready']);
    const second = [...(section(app, 'grid.rows')?.querySelectorAll('[data-test="table-row"]')[1]?.querySelectorAll('td') ?? [])].map((cell) => cell.textContent.trim());
    expect([second[4], second[7]]).toEqual(['No', '']);
    expect(section(app, 'grid.rows')?.querySelector('[data-test="badge"]')?.className).toContain('bg-success-soft');

    const big = section(app, 'grid.many');
    expect(big?.querySelectorAll('[data-test="table-row"]')).toHaveLength(10);
    expect(big?.querySelector('[data-test="table-count"]')?.textContent).toBe('Showing 10 of 42');
    await click(big?.querySelector<HTMLElement>('[data-test="table-more"]') ?? null);
    expect(big?.querySelectorAll('[data-test="table-row"]')).toHaveLength(35);
    const search = big?.querySelector<HTMLInputElement>('[data-test="table-search"]');
    if (search) {
      search.value = 'needle';
      search.dispatchEvent(new Event('input'));
    }
    await app.settle();
    expect([...(big?.querySelectorAll('[data-test="table-row"]') ?? [])].map((row) => row.textContent)).toEqual(['Needle']);

    expect(section(app, 'grid.empty')?.querySelector('[data-test="table-empty"]')?.textContent).toBe('No rows here.');
    expect(section(app, 'grid.default')?.querySelector('[data-test="table-empty"]')?.textContent).toBe('Nothing here yet.');
    expect(section(app, 'grid.slow')?.querySelector('[data-test="loading"]')).not.toBeNull();
    releaseSlow();
    await app.settle();
    expect(section(app, 'grid.slow')?.querySelector('[data-test="loading"]')).toBeNull();
    expect(section(app, 'grid.slow')?.textContent).toContain('Late');
    const down = section(app, 'grid.down');
    expect(down?.querySelector('[data-test="query-failed"]')?.textContent).toContain('Down.');
    const before = api.callsTo('grid.down.get').length;
    await click(button(app, 'Try again'));
    expect(api.callsTo('grid.down.get')).toHaveLength(before + 1);

    const firstRow = section(app, 'grid.rows')?.querySelector<HTMLElement>('[data-test="table-row"]') ?? null;
    await click(firstRow);
    expect(app.router.currentRoute.value.fullPath).toBe('/grid/item/a1');
    await app.router.push('/');
    await app.settle();
    section(app, 'grid.rows')?.querySelectorAll<HTMLElement>('[data-test="table-row"]')[1]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await app.settle();
    expect(app.router.currentRoute.value.fullPath).toBe('/grid/item/b2');
  });
});
