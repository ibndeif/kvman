import { describe, expect, it, vi } from 'vitest';
import { click } from './support/mount-app.ts';
import { mountOpenui } from './support/openui-page.ts';

const blocks = [
  'root = Stack([snippets, overview, rolling, context, composite, visual])',
  'snippets = SnippetCardBlock([s1, s2])',
  's1 = SnippetCardItem("a", IconText(Icon("users"), "success", "m", "Seats"), Text("number", "12"))',
  's2 = SnippetCardItem("b", IconText(Icon("clock"), "info", "m", "Uptime"), BoldText("number", "99.9%", "+0.2", "metric"))',
  'overview = OverviewCardBlock([o1, o2])',
  'o1 = OverviewCardItem("x", Text("text", "Revenue"), MetricIndicatorInline("$12k", "this week", {direction: "up", value: 8}))',
  'o2 = OverviewCardItem("y", Text("text", "Churn"), MetricIndicatorInline("2%", null, {direction: "down", value: 1}))',
  'rolling = OverviewCardBlock([o1, o2], "carousel")',
  'context = ContextCardBlock([c1, c2])',
  'c1 = ContextCardItem("c1", "Summary", "Things are **fine**", "gray")',
  'c2 = ContextCardItem("c2", Tag("Risk", null, "sm", "warning"), "Watch the queue")',
  'composite = CompositeCardBlock([p1, p2])',
  'p1 = CompositeCardItem("p1", Text("text", "Basic"), [Text("text", "For one"), MetricIndicatorInline("$9"), TagBlock(["new"]), BarChart(["a", "b"], [Series("s", [1, 2])])], {price: MetricIndicatorWithStrikethrough("$9", "a month", "$12", {direction: "down", value: 25}), button: Button("Choose")})',
  'p2 = CompositeCardItem("p2", Text("text", "Team"), [BoldText("text", "For five", "-1 seat", "metric")])',
  'visual = VisualCardBlock([v1, v2])',
  'v1 = VisualCardItem(BoldText("text", "Garden room"), "v1", null, Tag("New"))',
  'v2 = VisualCardItem(BoldText("text", "Sea room"), "v2")',
].join('\n');

const pressed = [
  'root = Stack([snippets, visual, overview])',
  'snippets = SnippetCardBlock([s1, s2], "grid", true, Action([@ToAssistant("Tell me more")]))',
  's1 = SnippetCardItem("a", IconText(Icon("users"), "neutral", "m", "Seats"))',
  's2 = SnippetCardItem("b", IconText(Icon("clock"), "neutral", "m", "Uptime"))',
  'visual = VisualCardBlock([v1, v2], "grid", true, Action([@ToAssistant("Tell me more")]))',
  'v1 = VisualCardItem(BoldText("text", "Garden room"))',
  'v2 = VisualCardItem(BoldText("text", "Sea room"))',
  'overview = OverviewCardBlock([o1, o2])',
  'o1 = OverviewCardItem("x", Text("text", "Revenue"))',
  'o2 = OverviewCardItem("y", Text("text", "Churn"))',
].join('\n');

const cardsOf = (root: HTMLElement, index: number): HTMLElement[] => [...(root.querySelectorAll('[data-test="card-block"]')[index]?.querySelectorAll<HTMLElement>('[data-test="card"]') ?? [])];

describe('OpenUI card blocks (06 §6.1, ADR 0124, 14, 16)', () => {
  it('M5.20-H2 each card block draws its cards with their parts', async () => {
    const { app } = await mountOpenui(blocks);
    expect([0, 1, 2, 3, 4, 5].map((index) => cardsOf(app.root, index).length)).toEqual([2, 2, 2, 2, 2, 2]);
    const [snippet] = cardsOf(app.root, 0);
    expect(snippet?.textContent).toContain('Seats');
    const twelve = [...(snippet?.querySelectorAll('span') ?? [])].findLast((part) => part.textContent.trim() === '12');
    expect(twelve?.className).toContain('tabular-nums');
    expect(twelve?.getAttribute('dir')).toBe('ltr');
    expect([...app.root.querySelectorAll('span')].findLast((part) => part.textContent.trim() === '+0.2')?.className).toContain('text-success-ink');
    expect([...app.root.querySelectorAll('span')].findLast((part) => part.textContent.trim() === '-1 seat')?.className).toContain('text-danger-ink');
    expect(cardsOf(app.root, 1)[0]?.querySelector('[data-test="metric-trend"]')?.textContent.trim()).toBe('8%');
    expect(cardsOf(app.root, 1)[0]?.querySelector('[data-test="metric-trend"]')?.className).toContain('text-success-ink');
    expect(app.root.querySelectorAll('[data-test="card-block"]')[2]?.className).toContain('overflow-x-auto');
    expect(cardsOf(app.root, 3)[0]?.className).toContain('bg-sunken');
    expect(cardsOf(app.root, 3)[0]?.querySelector('strong')?.textContent).toBe('fine');
    expect(cardsOf(app.root, 3)[1]?.textContent).toContain('Risk');
    const [basic] = cardsOf(app.root, 4);
    expect(basic?.querySelector('s')?.textContent).toBe('$12');
    expect(basic?.querySelector('[data-test="openui-chart"]')).not.toBeNull();
    expect(basic?.textContent).toContain('Choose');
    expect(cardsOf(app.root, 5)[0]?.textContent).toContain('New');
    expect(cardsOf(app.root, 5)[0]?.textContent).toContain('Garden room');
  });

  it("M5.20-H3 a card press sends the block's action, a blank line, and the card's label; a block with no action has no buttons", async () => {
    const onMessage = vi.fn();
    const { app } = await mountOpenui(pressed, onMessage);
    await click(cardsOf(app.root, 0)[1] ?? null);
    await click(cardsOf(app.root, 1)[0] ?? null);
    expect(onMessage.mock.calls).toEqual([['Tell me more\n\nUptime'], ['Tell me more\n\nGarden room']]);
    expect(cardsOf(app.root, 2).map((card) => card.tagName)).toEqual(['DIV', 'DIV']);
  });

  it('M5.20-H3 without onMessage, pressable cards are disabled', async () => {
    const { app } = await mountOpenui(pressed);
    for (const card of cardsOf(app.root, 0)) expect((card as HTMLButtonElement).disabled).toBe(true);
  });
});
