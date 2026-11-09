import { afterEach, describe, expect, it, vi } from 'vitest';
import { button, click, mountApp, settle, type } from './support/mount-app.ts';
import { markdownPage, mountOpenui } from './support/openui-page.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

// A reply's block with every kind of press of the chat library (M5.18-H6, E5).
const presses = [
  'root = Card([choices, refresh, follow])',
  'choices = Buttons([yes, maybe])',
  'yes = Button("Yes", Action([@ToAssistant("Use the first plan")]))',
  'maybe = Button("Maybe")',
  'refresh = IconButton("Refresh", Icon("refresh-cw"), Action([@ToAssistant("Refresh the list")]))',
  'follow = FollowUpBlock([tell])',
  'tell = FollowUpItem("Tell me more")',
].join('\n');

const booking = [
  'root = Stack([booking])',
  'booking = Form("booking", actions, [name, room, extras, budget, notes])',
  'actions = Buttons([send])',
  'send = Button("Send", Action([@ToAssistant("Book it")]))',
  'name = FormControl("Name", Input("name"))',
  'room = FormControl("Room", Select("room", [garden, sea]))',
  'garden = SelectItem("a", "Garden")',
  'sea = SelectItem("b", "Sea")',
  'extras = FormControl("Extras", CheckBoxGroup("extras", [breakfast, parking]))',
  'breakfast = CheckBoxItem("Breakfast", "", "breakfast")',
  'parking = CheckBoxItem("Parking", "", "parking")',
  'budget = FormControl("Budget", Slider("budget", "continuous", 0, 500, 10, [0, 500]))',
  'notes = FormControl("Notes", TextArea("notes"))',
].join('\n');

const subscribe = [
  'root = Stack([signup])',
  'signup = Form("signup", actions, [email])',
  'actions = Buttons([send])',
  'send = Button("Send", Action([@ToAssistant("Subscribe")]))',
  'email = FormControl("Email", Input("email", "you@example.com", "email", {required: true, email: true}))',
].join('\n');

const fenced = (source: string): string => `\`\`\`openui\n${source}\n\`\`\`\n`;

describe('presses in OpenUI (06 §6.1, ADR 0124)', () => {
  it('M5.18-H6 a button, a button with no action, an icon button, and a follow-up each send their message', async () => {
    const onMessage = vi.fn();
    const { text, api, components } = markdownPage(onMessage);
    const app = await mountApp(api, '/notes/custom', components);
    text.value = fenced(presses);
    await settle();
    await click(button(app, 'Yes'));
    await click(button(app, 'Maybe'));
    await click(app.find('button[aria-label="Refresh"]'));
    await click(button(app, 'Tell me more'));
    expect(onMessage.mock.calls).toEqual([['Use the first plan'], ['Maybe'], ['Refresh the list'], ['Tell me more']]);
  });

  it('M5.18-E5 without `onMessage`, buttons, icon buttons, and follow-ups are disabled and send nothing', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const { text, api, components } = markdownPage();
    const app = await mountApp(api, '/notes/custom', components);
    text.value = fenced(presses);
    await settle();
    const before = api.calls.length;
    const pressable = [button(app, 'Yes'), button(app, 'Maybe'), app.find('button[aria-label="Refresh"]'), button(app, 'Tell me more')];
    for (const control of pressable) {
      expect(control).toBeInstanceOf(HTMLButtonElement);
      expect((control as HTMLButtonElement).disabled).toBe(true);
      await click(control);
    }
    expect(open).not.toHaveBeenCalled();
    expect(api.calls.length).toBe(before);
  });

  it("M5.18-H7 a form's button sends its text, then one `<label>: <value>` line per control in order", async () => {
    const onMessage = vi.fn();
    const { app } = await mountOpenui(booking, onMessage);
    const root = app.root;
    await type(root.querySelector('input[name="name"]'), 'Ada');
    await type(root.querySelector('select[name="room"]'), 'b');
    for (const box of root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) await click(box);
    const thumbs = root.querySelectorAll<HTMLInputElement>('input[type="range"]');
    await type(thumbs[0] ?? null, '100');
    await type(root.querySelectorAll<HTMLInputElement>('input[type="range"]')[1] ?? null, '300');
    await click(button(app, 'Send'));
    expect(onMessage.mock.calls).toEqual([['Book it\n\nName: Ada\nRoom: Sea\nExtras: Breakfast, Parking\nBudget: 100 – 300\nNotes: (empty)']]);
  });

  it('M5.18-E7 a form whose rules fail sends nothing and shows the rule broken; a valid one sends', async () => {
    const onMessage = vi.fn();
    const { app } = await mountOpenui(subscribe, onMessage);
    await click(button(app, 'Send'));
    expect(onMessage).not.toHaveBeenCalled();
    expect(app.find('[role="alert"]')?.textContent.trim()).toBe('This field is required');
    await type(app.root.querySelector('input[name="email"]'), 'not-an-email');
    await click(button(app, 'Send'));
    expect(onMessage).not.toHaveBeenCalled();
    expect(app.find('[role="alert"]')?.textContent.trim()).toBe('Enter a valid email address');
    await type(app.root.querySelector('input[name="email"]'), 'ada@example.com');
    expect(app.find('[role="alert"]')).toBeNull();
    await click(button(app, 'Send'));
    expect(onMessage.mock.calls).toEqual([['Subscribe\n\nEmail: ada@example.com']]);
  });

  it('M5.18-E5 without `onMessage`, a form\'s controls and buttons are disabled', async () => {
    const { app } = await mountOpenui(booking);
    const controls = app.root.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement>('[data-test="openui"] input, [data-test="openui"] select, [data-test="openui"] textarea, [data-test="openui"] button');
    expect(controls.length).toBeGreaterThan(5);
    for (const element of controls) expect(element.disabled, element.outerHTML).toBe(true);
  });

  it('M5.18-H8 `@OpenUrl` opens a web address through `kvman.open`', async () => {
    const onMessage = vi.fn();
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const source = ['root = Card([docs])', 'docs = Button("Docs", Action([@OpenUrl("https://example.com/docs")]))'].join('\n');
    const { app } = await mountOpenui(source, onMessage);
    await click(button(app, 'Docs'));
    expect(open).toHaveBeenCalledWith('https://example.com/docs', '_blank');
    expect(onMessage).not.toHaveBeenCalled();
  });

  it('M5.18-H9 `$variables` with `@Set` and `@Reset` change only the page', async () => {
    const onMessage = vi.fn();
    const source = [
      '$count = 0',
      'root = Card([text, add, clear])',
      'text = TextContent("Count " + $count)',
      'add = Button("Add", Action([@Set($count, $count + 1)]))',
      'clear = Button("Clear", Action([@Reset($count)]))',
    ].join('\n');
    const { api, app } = await mountOpenui(source, onMessage);
    const before = api.calls.length;
    await click(button(app, 'Add'));
    expect(app.text()).toContain('Count 1');
    await click(button(app, 'Add'));
    expect(app.text()).toContain('Count 2');
    await click(button(app, 'Clear'));
    expect(app.text()).toContain('Count 0');
    expect(onMessage).not.toHaveBeenCalled();
    expect(api.calls.length).toBe(before);
  });

  it('M5.18-E4 `Query`, `Mutation`, and `@Run` do nothing', async () => {
    const onMessage = vi.fn();
    const source = [
      'data = Query("tickets", {})',
      'root = Stack([text, run])',
      'text = TextContent("Rows " + @Count(data.rows))',
      'run = Button("Run", Action([@Run(data)]))',
    ].join('\n');
    const { api, app } = await mountOpenui(source, onMessage);
    const before = api.calls.length;
    expect(app.text()).toContain('Rows 0');
    await click(button(app, 'Run'));
    expect(onMessage).not.toHaveBeenCalled();
    expect(api.calls.length).toBe(before);
  });

  it('M5.18-E6 controls are disabled while the block streams', async () => {
    const onMessage = vi.fn();
    const { text, api, components } = markdownPage(onMessage);
    const app = await mountApp(api, '/notes/custom', components);
    text.value = '```openui\nroot = Card([go])\ngo = Button("Go", Action([@ToAssistant("Start")]))\n';
    await settle();
    const disabled = button(app, 'Go') as HTMLButtonElement | null;
    expect(disabled?.disabled).toBe(true);
    await click(disabled);
    expect(onMessage).not.toHaveBeenCalled();
    text.value += '```\n';
    await settle();
    const enabled = button(app, 'Go') as HTMLButtonElement | null;
    expect(enabled?.disabled).toBe(false);
    await click(enabled);
    expect(onMessage).toHaveBeenCalledWith('Start');
  });

  it('M5.18-E8 `@OpenUrl` opens only http and https', async () => {
    const onMessage = vi.fn();
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const source = [
      'root = Stack([js, data, file, relative])',
      'js = Button("Js", Action([@OpenUrl("javascript:alert(1)")]))',
      'data = Button("Data", Action([@OpenUrl("data:text/html,x")]))',
      'file = Button("File", Action([@OpenUrl("file:///etc/passwd")]))',
      'relative = Button("Relative", Action([@OpenUrl("/relative")]))',
    ].join('\n');
    const { app } = await mountOpenui(source, onMessage);
    for (const label of ['Js', 'Data', 'File', 'Relative']) await click(button(app, label));
    expect(open).not.toHaveBeenCalled();
    expect(onMessage).not.toHaveBeenCalled();
  });
});
