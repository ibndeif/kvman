import { describe, expect, it, vi } from 'vitest';
import { click } from './support/mount-app.ts';
import { mountOpenui } from './support/openui-page.ts';

const pixel = 'data:image/png;base64,iVBORw0KGgo=';
const lists = [
  'root = Stack([totals, options, pictures])',
  'totals = EntityList([{left: "Plan", right: "Pro"}, {left: "Seats", right: "12", rightVariant: "number"}, {left: "Region", right: "EU"}], "default", {left: "Item", right: "Value"}, {left: "Total", right: "1200", rightVariant: "number"})',
  'options = ListBlock([a, b, c])',
  'a = ListItem("Option A", "The first")',
  'b = ListItem("Option B", "The second", null, "Choose", Action([@ToAssistant("Option B")]))',
  'c = ListItem("Option C")',
  'pictures = ListBlock([local, remote], "image", "small")',
  `local = ListItem("Local", null, {src: "${pixel}", alt: "dot"})`,
  'remote = ListItem("Remote", null, {src: "https://example.com/x.png", alt: "web picture"})',
].join('\n');

describe('OpenUI lists (06 §6.1, ADR 0124, 7, 14, 16)', () => {
  it('M5.19-H6 lists draw their items, and only an item with an action is a button, which sends it', async () => {
    const onMessage = vi.fn();
    const { app } = await mountOpenui(lists, onMessage);
    const rows = [...app.root.querySelectorAll('dl > div')].map((row) => [...row.children].map((part) => part.textContent.trim()));
    expect(rows).toEqual([['Item', 'Value'], ['Plan', 'Pro'], ['Seats', '12'], ['Region', 'EU'], ['Total', '1200']]);
    const seats = [...app.root.querySelectorAll('dd')].find((value) => value.textContent.trim() === '12');
    expect(seats?.className).toContain('tabular-nums');
    expect(seats?.getAttribute('dir')).toBe('ltr');
    const numbered = app.root.querySelectorAll('ol')[0];
    expect([...(numbered?.querySelectorAll('li > * > span[aria-hidden="true"]') ?? [])].map((number) => number.textContent)).toEqual(['1', '2', '3']);
    expect(numbered?.textContent).toContain('The second');
    expect(numbered?.querySelectorAll('button')).toHaveLength(1);
    expect(numbered?.querySelector('button')?.textContent).toContain('Option B');
    await click(numbered?.querySelector<HTMLElement>('button') ?? null);
    expect(onMessage.mock.calls).toEqual([['Option B']]);
    expect(app.root.querySelector(`img[src="${pixel}"]`)?.getAttribute('alt')).toBe('dot');
    expect(app.find('[data-test="openui-image-placeholder"]')?.textContent).toBe('web picture (https://example.com/x.png)');
    expect(app.root.querySelectorAll('img')).toHaveLength(1);
  });

  it('M5.19-H6 without onMessage, the item with an action is disabled', async () => {
    const { app } = await mountOpenui(lists);
    const item = app.root.querySelector<HTMLButtonElement>('ol button');
    expect(item?.disabled).toBe(true);
  });

  it('M5.19-E4 an EntityList of size small draws no header or footer', async () => {
    const { app } = await mountOpenui('root = Stack([small])\nsmall = EntityList([{left: "Plan", right: "Pro"}], "small", {left: "Item", right: "Value"}, {left: "Total", right: "1"})');
    expect(app.text()).toContain('Plan');
    expect(app.find('[data-test="entity-header"]')).toBeNull();
    expect(app.find('[data-test="entity-footer"]')).toBeNull();
  });
});
