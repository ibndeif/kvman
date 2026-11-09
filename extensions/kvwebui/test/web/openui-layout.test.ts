import { afterEach, describe, expect, it, vi } from 'vitest';
import { button, click, mountApp, settle } from './support/mount-app.ts';
import { markdownPage, mountOpenui } from './support/openui-page.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

const content = [
  'root = Stack([card, rule, guide, tags, done])',
  'card = Card([header, body, notes, saved, careful, totals, code])',
  'header = CardHeader("Weekly report", "Week 45")',
  'body = TextContent("**Bold** words <script>window.hacked = true</script>")',
  'notes = MarkDownRenderer("Some *notes*", "card")',
  'saved = Callout("success", "Saved", "All *good*")',
  'careful = TextCallout("danger", "Careful", "Plain words")',
  'totals = InlineHeader("Totals", "This week")',
  'code = CodeBlock("ts", "const a = 1;")',
  'rule = Separator()',
  'guide = Steps([install, start])',
  'install = StepsItem("Install", "Run **pnpm install**")',
  'start = StepsItem("Start", "Run kvman")',
  'tags = TagBlock(["alpha", "beta"])',
  'done = Tag("Done", Icon("check"), "sm", "success")',
].join('\n');

const containers = [
  'root = Stack([views, more])',
  'views = Tabs([first, second])',
  'first = TabItem("first", "First", [one])',
  'second = TabItem("second", "Second", [two])',
  'one = TextContent("Panel one")',
  'two = TextContent("Panel two")',
  'more = Accordion([a, b])',
  'a = AccordionItem("a", "Section A", [inA])',
  'b = AccordionItem("b", "Section B", [inB])',
  'inA = TextContent("Inside A")',
  'inB = TextContent("Inside B")',
].join('\n');

const sections = ['root = Card([parts])', 'parts = SectionBlock([s1, s2, s3])', 's1 = SectionItem("s1", "Intro", [t1])', 's2 = SectionItem("s2", "Middle", [t2])', 's3 = SectionItem("s3", "End", [t3])', 't1 = TextContent("Text one")', 't2 = TextContent("Text two")', 't3 = TextContent("Text three")'];

const tab = (app: { findAll(selector: string): HTMLElement[] }, name: string): HTMLElement | undefined => app.findAll('[role="tab"]').find((element) => element.textContent.trim() === name);

describe('OpenUI layout and content components (06 §6.1, ADR 0124, 4, 16)', () => {
  it('M5.18-H4 the content components draw their texts, Markdown sanitized, each text in its own direction', async () => {
    const { app } = await mountOpenui(content);
    for (const words of ['Weekly report', 'Week 45', 'notes', 'Saved', 'good', 'Careful', 'Plain words', 'Totals', 'This week', 'const a = 1;', 'Install', 'Start', 'alpha', 'beta', 'Done']) expect(app.text()).toContain(words);
    expect(app.find('[data-test="openui"] strong')?.textContent).toBe('Bold');
    expect(app.find('[data-test="openui"] script')).toBeNull();
    expect(Reflect.get(window, 'hacked')).toBeUndefined();
    expect(app.findAll('[role="separator"]').length).toBe(1);
    expect(app.findAll('ol li').map((step) => step.querySelector('[aria-hidden="true"]')?.textContent)).toEqual(['1', '2']);
    for (const words of ['Weekly report', 'Careful', 'Plain words', 'Totals', 'Install', 'alpha']) {
      const element = app.findAll('[dir="auto"]').find((candidate) => candidate.textContent.trim() === words);
      expect(element, words).toBeDefined();
    }
    expect(app.find('code')?.closest('[dir="ltr"]')).not.toBeNull();
  });

  it('M5.18-H4 CodeBlock copies its code, shows Copied for 2 s, and a failed copy says so', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { app } = await mountOpenui('root = Stack([code])\ncode = CodeBlock("ts", "const a = 1;")');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await click(button(app, 'Copy'));
    expect(writeText).toHaveBeenCalledWith('const a = 1;');
    expect(button(app, 'Copied')).not.toBeNull();
    vi.advanceTimersByTime(2000);
    await settle();
    expect(button(app, 'Copy')).not.toBeNull();
    writeText.mockImplementationOnce(() => Promise.reject(new Error('denied')));
    await click(button(app, 'Copy'));
    expect(button(app, 'Copy')).not.toBeNull();
    expect(app.text()).toContain("Couldn't copy");
  });

  it('M5.18-H4 a tab shows its panel, the first at first; arrow keys move between tabs, mirrored right to left', async () => {
    const { app } = await mountOpenui(containers);
    expect(app.find('[role="tabpanel"]')?.textContent).toContain('Panel one');
    await click(tab(app, 'Second') ?? null);
    expect(app.find('[role="tabpanel"]')?.textContent).toContain('Panel two');
    const list = app.find('[role="tablist"]');
    list?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    await settle();
    expect(app.find('[role="tabpanel"]')?.textContent).toContain('Panel one');
    document.documentElement.dir = 'rtl';
    list?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    await settle();
    expect(app.find('[role="tabpanel"]')?.textContent).toContain('Panel two');
    list?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    await settle();
    expect(app.find('[role="tabpanel"]')?.textContent).toContain('Panel one');
  });

  it('M5.18-H4 an accordion opens one item at a time and closes the open one, without onMessage', async () => {
    const { app } = await mountOpenui(containers);
    const trigger = (name: string) => app.findAll('button[aria-expanded]').find((element) => element.textContent.trim() === name) ?? null;
    expect(trigger('Section B')?.getAttribute('aria-expanded')).toBe('true');
    await click(trigger('Section A'));
    expect(app.text()).toContain('Inside A');
    expect(app.text()).not.toContain('Inside B');
    await click(trigger('Section A'));
    expect(app.text()).not.toContain('Inside A');
    expect(trigger('Section A')?.getAttribute('aria-expanded')).toBe('false');
  });

  it('M5.18-H4 sections open as they stream in, and only the first stays open when the stream ends', async () => {
    const { text, api, components } = markdownPage();
    const app = await mountApp(api, '/notes/custom', components);
    const opened = () => app.findAll('button[aria-expanded="true"]').map((element) => element.textContent.trim());
    const lines = ['```openui', ...sections];
    for (let count = 1; count <= lines.length; count += 1) {
      text.value = `${lines.slice(0, count).join('\n')}\n`;
      await settle();
    }
    expect(opened()).toEqual(['Intro', 'Middle', 'End']);
    text.value = `${lines.join('\n')}\n\`\`\`\n`;
    await settle();
    expect(opened()).toEqual(['Intro']);
  });
});

describe('OpenUI icons (06 §6.1, ADR 0124, 8)', () => {
  it("M5.18-E9 an unknown icon falls back to its category's icon, else circle-dot, and its icon button still works", async () => {
    const onMessage = vi.fn();
    const source = ['root = Stack([money, other, button])', 'money = Icon("no-such-icon", "finance")', 'other = Icon("no-such-icon")', 'button = IconButton("Retry", other, Action([@ToAssistant("Try again")]))'].join('\n');
    const { app } = await mountOpenui(source, onMessage);
    await vi.waitFor(() => expect(app.findAll('[data-test="openui"] svg').length).toBe(3));
    const drawn = app.findAll('[data-test="openui"] svg').map((svg) => svg.innerHTML);
    expect(drawn[0]).toContain('M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6');
    expect(drawn[1]).toContain('<circle');
    expect(drawn[1]).not.toContain('M17 5H9.5');
    await click(app.find('button[aria-label="Retry"]'));
    expect(onMessage).toHaveBeenCalledWith('Try again');
  });
});
