import { describe, expect, it, vi } from 'vitest';
import { button, click, type } from './support/mount-app.ts';
import { mountOpenui } from './support/openui-page.ts';

const rows = Array.from({ length: 12 }, (_, index) => `{name: "Row ${String(index + 1)}", score: ${String(index * 10)}, state: "${index % 2 === 0 ? 'open' : 'done'}"}`).join(', ');
const paged = [`items = [${rows}]`, 'root = Stack([list])', 'list = Table([Col("Name", items.name), Col("Score", items.score, "number"), Col("State", @Each(items, "item", Tag(item.state)))])'].join('\n');

const sorting = [
  '$sortField = "score"',
  '$search = ""',
  'items = [{name: "Alpha", score: 3}, {name: "Beta", score: 9}, {name: "Gamma", score: 5}]',
  'sorted = @Sort(@Filter(items, "name", "contains", $search), $sortField, "desc")',
  'root = Stack([pick, search, list, chart])',
  'pick = Select("sort", [SelectItem("score", "Score"), SelectItem("name", "Name")], null, null, $sortField)',
  'search = Input("search", "Search", "text", null, $search)',
  'list = Table([Col("Name", sorted.name), Col("Score", sorted.score, "number")])',
  'chart = BarChart(sorted.name, [Series("Score", sorted.score)])',
].join('\n');

const columns = [
  '{type: "text", key: "name", header: "Name"}',
  '{type: "number", key: "price", header: "Price"}',
  '{type: "select", key: "size", header: "Size", options: [{value: "s", label: "Small"}, {value: "l", label: "Large"}]}',
  '{type: "date-single", key: "day", header: "Day"}',
  '{type: "url", key: "link", header: "Link"}',
].join(', ');
const prices = `root = Stack([prices])\nprices = EditableTable("prices", [${columns}], [{id: "1", values: ["Tea | hot", 3, "s", "2026-11-09", "https://example.com/tea"]}, {id: "2", values: ["Coffee", 4, "l", "2026-11-10", "https://example.com/coffee"]}])`;

const bodyRows = (root: HTMLElement): string[][] => [...root.querySelectorAll('tbody tr')].map((row) => [...row.querySelectorAll('td')].map((cell) => cell.textContent.trim()));
const cells = (root: HTMLElement): HTMLInputElement[] => [...root.querySelectorAll<HTMLInputElement>('tbody input')];

describe('OpenUI tables (06 §6.1, ADR 0124, 4, 14, 16)', () => {
  it('M5.19-H1 a table draws its columns and cells, a number column at the inline end, and pages of 10 rows', async () => {
    const { app } = await mountOpenui(paged);
    expect([...app.root.querySelectorAll('thead th')].map((cell) => cell.textContent.trim())).toEqual(['Name', 'Score', 'State']);
    expect(bodyRows(app.root)).toHaveLength(10);
    expect(bodyRows(app.root)[0]).toEqual(['Row 1', '0', 'open']);
    const score = app.root.querySelector('tbody td:nth-child(2)');
    expect(score?.className).toContain('text-end');
    expect(score?.getAttribute('dir')).toBe('ltr');
    expect(app.root.querySelector('tbody td:nth-child(3) span.rounded-full')?.textContent.trim()).toBe('open');
    expect(app.find('[data-test="table-page"]')?.textContent).toBe('1 / 2');
    await click(app.find('button[aria-label="Next page"]'));
    expect(bodyRows(app.root).map((row) => row[0])).toEqual(['Row 11', 'Row 12']);
    expect(app.find('[data-test="table-page"]')?.textContent).toBe('2 / 2');
    await click(app.find('button[aria-label="Previous page"]'));
    expect(bodyRows(app.root)).toHaveLength(10);
  });

  it('M5.19-H2 @Sort and @Filter over bound controls change the table and the chart drawn from them', async () => {
    const { app } = await mountOpenui(sorting, vi.fn());
    const names = () => bodyRows(app.root).map((row) => row[0]);
    const bars = () => [...app.root.querySelectorAll('[data-test="chart-category"]')].map((label) => label.textContent);
    expect(names()).toEqual(['Beta', 'Gamma', 'Alpha']);
    expect(bars()).toEqual(['Beta', 'Gamma', 'Alpha']);
    await type(app.root.querySelector('select[name="sort"]'), 'name');
    expect(names()).toEqual(['Gamma', 'Beta', 'Alpha']);
    await type(app.root.querySelector('input[name="search"]'), 'mm');
    expect(names()).toEqual(['Gamma']);
    expect(bars()).toEqual(['Gamma']);
  });

  it('M5.19-H3 an editable table counts changes, resets them, and its save sends the table as Markdown', async () => {
    const onMessage = vi.fn();
    const { app } = await mountOpenui(prices, onMessage);
    expect(app.find('[data-test="table-changes"]')).toBeNull();
    await type(cells(app.root)[1] ?? null, '5');
    await type(cells(app.root)[4] ?? null, 'Latte');
    expect(app.find('[data-test="table-changes"]')?.textContent).toContain('2 changes');
    await click(button(app, 'Reset'));
    expect(cells(app.root)[1]?.value).toBe('3');
    expect(app.find('[data-test="table-changes"]')).toBeNull();
    await type(app.root.querySelectorAll<HTMLSelectElement>('tbody select')[1] ?? null, 's');
    expect(app.find('[data-test="table-changes"]')?.textContent).toContain('1 change');
    await click(button(app, 'Save changes'));
    expect(onMessage.mock.calls).toEqual([
      [
        [
          'Save changes',
          '',
          '| Name | Price | Size | Day | Link |',
          '| --- | --- | --- | --- | --- |',
          '| Tea \\| hot | 3 | Small | 2026-11-09 | https://example.com/tea |',
          '| Coffee | 4 | Small | 2026-11-10 | https://example.com/coffee |',
        ].join('\n'),
      ],
    ]);
    expect(app.find('[data-test="table-changes"]')).toBeNull();
  });

  it("M5.19-E3 without onMessage an editable table's cells are disabled", async () => {
    const { app } = await mountOpenui(prices);
    const controls = app.root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('tbody input, tbody select');
    expect(controls.length).toBe(10);
    for (const control of controls) expect(control.disabled).toBe(true);
  });
});
