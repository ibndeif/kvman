import { afterEach, describe, expect, it, vi } from 'vitest';
import { button, click, mountApp, settle } from './support/mount-app.ts';
import { mountOpenui, openuiPage } from './support/openui-page.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

const editing = [
  '$open = false',
  'root = Stack([edit, dialog])',
  'edit = Button("Edit", Action([@Set($open, true)]))',
  'dialog = Modal("Edit", $open, [form])',
  'form = Form("edit", Buttons([Button("Save", Action([@Set($open, false)]))]), [FormControl("Name", Input("name")), FormControl("Notes", TextArea("notes"))])',
].join('\n');

const slides = 'root = Stack([turns])\nturns = Carousel([[TextContent("One")], [TextContent("Two")], [TextContent("Three")]])';

const plans = (type: string) =>
  [
    'root = Stack([form])',
    'form = Form("plan", Buttons([Button("Send", Action([@ToAssistant("My plan")]))]), [choice])',
    `choice = FormControl("Plan", OptionCards("plan", "${type}", [OptionCard("basic", "Basic", "For one", Icon("user")), OptionCard("team", "Team", "For five", Image("Team photo", "data:image/png;base64,iVBORw0KGgo=")), OptionCard("max", "Max")]))`,
  ].join('\n');

const dialog = (): HTMLElement | null => document.querySelector<HTMLElement>('[role="dialog"]');
const option = (root: HTMLElement, title: string) => [...root.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')].find((card) => card.textContent.includes(title)) ?? null;

async function openModal(app: Awaited<ReturnType<typeof mountOpenui>>['app']): Promise<HTMLElement | null> {
  const edit = button(app, 'Edit');
  edit?.focus();
  await click(edit);
  return edit;
}

describe('OpenUI Modal (06 §6.1, ADR 0124, 16)', () => {
  it('M5.20-H6 a modal opens with @Set, keeps Tab inside, and closes with Escape, its button, or a press outside, giving focus back', async () => {
    const { app } = await mountOpenui(editing, vi.fn());
    expect(dialog()).toBeNull();
    const edit = await openModal(app);
    expect(dialog()?.getAttribute('aria-label')).toBe('Edit');
    expect(dialog()?.contains(document.activeElement)).toBe(true);
    const focusable = [...(dialog()?.querySelectorAll<HTMLElement>('button, input, textarea') ?? [])];
    focusable.at(-1)?.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    expect(document.activeElement).toBe(focusable[0]);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await settle();
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(edit);
    await openModal(app);
    await click(document.querySelector('[data-test="openui-dialog-close"]'));
    expect(dialog()).toBeNull();
    await openModal(app);
    await click(document.querySelector('[data-test="openui-dialog-backdrop"]'));
    expect(dialog()).toBeNull();
    await openModal(app);
    expect(dialog()).not.toBeNull();
  });

  it('M5.20-E4 a modal with no binding never opens', async () => {
    const { app } = await mountOpenui('root = Stack([note, dialog])\nnote = TextContent("Here")\ndialog = Modal("Note", null, [TextContent("Inside")])');
    expect(app.text()).toContain('Here');
    expect(dialog()).toBeNull();
  });
});

describe('OpenUI Carousel (06 §6.1, ADR 0124, 16)', () => {
  for (const [language, next] of [['en', 1], ['ar', -1]] as const) {
    it(`M5.20-H7 a carousel scrolls by its buttons and keys (${language})`, async () => {
      const { api, components } = openuiPage(slides);
      api.global.set('kernel.language', language);
      const app = await mountApp(api, '/notes/custom', components);
      await settle();
      const track = app.find('[data-test="carousel-track"]');
      if (track === null) throw new Error('The carousel has no track.');
      Object.defineProperty(track, 'clientWidth', { value: 500 });
      const scrolled = vi.spyOn(track, 'scrollBy').mockImplementation(() => undefined);
      expect(app.findAll('[data-test="carousel-slide"]')).toHaveLength(3);
      await click(app.find('[data-test="carousel-next"]'));
      await click(app.find('[data-test="carousel-previous"]'));
      track.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      track.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      expect(scrolled.mock.calls.map(([x]) => Math.sign(Number(x)))).toEqual([next, -next, 1, -1]);
    });
  }
});

describe('OpenUI OptionCards (06 §6.1, ADR 0124, 14)', () => {
  it('M5.20-H8 option cards choose one card, and the form sends its title; a multiple group joins its titles', async () => {
    const onMessage = vi.fn();
    const single = await mountOpenui(plans('single'), onMessage);
    await click(option(single.app.root, 'Basic'));
    await click(option(single.app.root, 'Team'));
    expect([option(single.app.root, 'Basic')?.getAttribute('aria-pressed'), option(single.app.root, 'Team')?.getAttribute('aria-pressed')]).toEqual(['false', 'true']);
    expect(single.app.root.querySelector('img')?.getAttribute('alt')).toBe('Team photo');
    await click(button(single.app, 'Send'));
    const multiple = await mountOpenui(plans('multiple'), onMessage);
    await click(option(multiple.app.root, 'Basic'));
    await click(option(multiple.app.root, 'Max'));
    await click(button(multiple.app, 'Send'));
    expect(onMessage.mock.calls).toEqual([['My plan\n\nPlan: Team'], ['My plan\n\nPlan: Basic, Max']]);
  });
});
