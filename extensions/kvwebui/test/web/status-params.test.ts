import type { Json } from '@kvman/sdk';
import { describe, expect, it } from 'vitest';
import { click, extension, mountApp } from './support/mount-app.ts';
import { notesApi, notesCatalog, notesUi } from './support/notes.ts';
import { textParams } from '../../web/src/contributions/references.ts';

const usage = { tokens: 3572, cost: 0.0004181, nested: { input: 4200 } };

function usageApi(status: Json[]) {
  const api = notesApi({ ui: notesUi({ status }) });
  api.handlers.set('notes.usage.get', () => usage);
  api.handlers.set('notes.chat.get', (input) => ({ id: (input as { noteId: string }).noteId, usage: { input: 4200, output: 1100, cost: 0.0012 } }));
  api.extensions.splice(0, api.extensions.length, extension('notes', { queries: [{ name: 'notes.note.list' }, { name: 'notes.usage.get' }, { name: 'notes.chat.get' }] }));
  api.catalogs['en'] = { ...notesCatalog, 'notes.status.usage': 'Workspace {tokens} · {cost}', 'notes.status.chat': 'Chat ↑ {input} ↓ {output} · {cost}' };
  return api;
}

const usageItem = { id: 'usage', query: 'notes.usage.get', input: {}, text: 'notes.status.usage', params: { tokens: { $output: 'tokens', format: 'compact' }, cost: { $output: 'cost', format: 'usd' } }, order: 1 };
const chatItem = { id: 'chat', query: 'notes.chat.get', input: { noteId: { $param: 'noteId' } }, text: 'notes.status.chat', params: { input: { $output: 'usage.input', format: 'compact' }, output: { $output: 'usage.output', format: 'compact' }, cost: { $output: 'usage.cost', format: 'usd' } }, order: 2 };

describe('status item params and inputs (06 §6.3, ADR 0009, 146, 147)', () => {
  it('QA3-H9 a formatted output param shows a compact number and US dollars, and reads a dotted path', async () => {
    const app = await mountApp(usageApi([usageItem, chatItem]), '/notes/note/n1');
    expect(app.find('[data-test="status-notes.usage"]')?.textContent).toBe('Workspace 3.6K · $0.0004');
    expect(app.find('[data-test="status-notes.chat"]')?.textContent).toBe('Chat ↑ 4.2K ↓ 1.1K · $0.0012');
  });

  it('QA3-H9 numbers follow the UI language', () => {
    const scope = { output: usage };
    const params = { tokens: { $output: 'tokens', format: 'compact' }, cost: { $output: 'cost', format: 'usd' } };
    expect(textParams(params, scope, 'ar')).toEqual({ tokens: new Intl.NumberFormat('ar', { notation: 'compact', maximumFractionDigits: 1 }).format(3572), cost: new Intl.NumberFormat('ar', { style: 'currency', currency: 'USD', minimumFractionDigits: 4 }).format(0.0004181) });
    expect(textParams({ plain: { $output: 'tokens' } }, scope, 'ar')).toEqual({ plain: '3572' });
  });

  it('QA3-E9 costs read well at any size', () => {
    const cost = (value: number, language = 'en') => textParams({ cost: { $output: 'cost', format: 'usd' } }, { output: { cost: value } }, language)['cost'];
    expect([cost(0), cost(1.5), cost(0.0004181), cost(0.00004344), cost(0.5), cost(0.009)]).toEqual(['$0.00', '$1.50', '$0.0004', '$0.00004', '$0.50', '$0.0090']);
    expect(cost(0.0004181, 'ar')).toBe(new Intl.NumberFormat('ar', { style: 'currency', currency: 'USD', minimumFractionDigits: 4 }).format(0.0004181));
  });

  it('QA3-E10 an item that reads a route param is hidden, and its query isn\'t run, on a page without it', async () => {
    const api = usageApi([usageItem, chatItem]);
    const app = await mountApp(api, '/notes/list');
    expect(app.find('[data-test="status-notes.usage"]')).not.toBeNull();
    expect(app.find('[data-test="status-notes.chat"]')).toBeNull();
    expect(api.callsTo('notes.chat.get')).toHaveLength(0);
    await app.router.push('/notes/note/n7');
    await app.settle();
    expect(app.find('[data-test="status-notes.chat"]')?.textContent).toBe('Chat ↑ 4.2K ↓ 1.1K · $0.0012');
    expect(api.callsTo('notes.chat.get').map((call) => call.input)).toEqual([{ noteId: 'n7' }]);
  });

  it("QA3-E9 a format kvwebui doesn't know keeps the item out and names the issue", async () => {
    const api = usageApi([{ ...usageItem, params: { tokens: { $output: 'tokens', format: 'roman' } } }]);
    const app = await mountApp(api, '/notes/list');
    expect(app.find('[data-test="status-notes.usage"]')).toBeNull();
    await click(app.find('[data-test="nav-kvwebui.extensions"]'));
    expect(app.text()).toContain('"path":"status.0.params.tokens.format"');
    expect(app.text()).toContain('isn\'t a format (compact or usd)');
  });
});
