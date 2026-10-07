import { describe, expect, it } from 'vitest';
import { part, parts, pressed, ranCard, shownLines, type Call } from './support/call-fixtures.ts';

const call = (payload: Call['payload']): Call => ({ description: 'Adding a note.', connector: 'notes', command: 'add', ...(payload === undefined ? {} : { payload }) });
const rowTexts = (wrapper: Awaited<ReturnType<typeof ranCard>>, block: string): string[] => wrapper.findAll(`[data-test="${block}"] > [data-test="call-fields"] > [data-test="field-row"]`).map((row) => row.text());

describe('the fields view never shows escaped JSON (08 §8.7, ADR 0036, 9)', () => {
  it('QA48-H10 any other call shows its payload and its output as rows, a text block, and a table', async () => {
    const payload = { title: 'Shopping', priority: 2, body: 'Milk\nBread\nحليب', tags: [{ name: 'home', color: 'red' }, { name: 'food', shared: true }] };
    const card = await ranCard(call(payload), { id: 'n1', saved: true });
    await pressed(card);
    const request = part(card, 'call-payload-fields');
    expect(request.findAll('[data-test="call-fields"] > [data-test="field-row"]').map((row) => row.attributes('data-name'))).toEqual(['title', 'priority', 'body', 'tags']);
    expect(request.find('[data-name="title"] [data-test="field-text"]').text()).toBe('Shopping');
    expect(request.find('[data-name="priority"] [data-test="field-text"]').text()).toBe('2');
    expect(shownLines(card, 'field-block')).toEqual(['Milk', 'Bread', 'حليب']);
    const table = request.find('[data-test="field-table"]');
    expect(table.findAll('th').map((cell) => cell.text())).toEqual(['name', 'color', 'shared']);
    expect(table.findAll('tbody tr').map((row) => row.findAll('td').map((cell) => cell.text()))).toEqual([['home', 'red', ''], ['food', '', 'true']]);
    expect(rowTexts(card, 'call-result-fields')).toEqual(['idn1', 'savedtrue']);
    const text = part(card, 'call-card').text();
    for (const hidden of ['\\n', '{', '"']) expect(text, hidden).not.toContain(hidden);
  });

  it('QA48-E13 empty values show a dash, scalars one per line, nested objects nested rows, and an array output a table', async () => {
    const card = await ranCard(call({ none: null, list: [], object: {}, names: ['a', 'b'], owner: { name: 'Ada', roles: ['admin'] } }), [{ id: 'n1', title: 'Milk' }, { id: 'n2', title: 'Bread' }]);
    await pressed(card);
    const request = part(card, 'call-payload-fields');
    for (const name of ['none', 'list', 'object']) expect(request.find(`[data-name="${name}"] [data-test="field-empty"]`).text(), name).toBe('—');
    expect(request.find('[data-name="names"] [data-test="field-items"]').findAll('div').map((item) => item.text())).toEqual(['a', 'b']);
    expect(request.findAll('[data-name="owner"] [data-test="field-row"]').map((row) => row.attributes('data-name'))).toEqual(['name', 'roles']);
    const output = part(card, 'call-result-fields');
    expect(output.findAll('tbody tr').map((row) => row.findAll('td').map((cell) => cell.text()))).toEqual([['n1', 'Milk'], ['n2', 'Bread']]);
    const bare = await ranCard(call(undefined), 'saved');
    await pressed(bare);
    expect(parts(bare, 'call-payload-fields')).toHaveLength(0);
    expect(part(bare, 'call-output').text()).toBe('saved');
  });
});
