import { describe, expect, it, vi } from 'vitest';
import { click, settle, type } from './support/mount-app.ts';
import { mountOpenui } from './support/openui-page.ts';

const controls = [
  '$name = "Ada"',
  'root = Stack([form, notify, notes, greet, nameField])',
  'form = Form("profile", actions, [f1, f2, f3, f4, f5, f6, f7, f8])',
  'actions = Buttons([save])',
  'save = Button("Save", Action([@ToAssistant("Save profile")]))',
  'f1 = FormControl("Title", Input("title", "Your title"))',
  'f2 = FormControl("Bio", TextArea("bio", "About you", 4))',
  'f3 = FormControl("Room", Select("room", [garden, sea], "Pick one"))',
  'garden = SelectItem("a", "Garden")',
  'sea = SelectItem("b", "Sea")',
  'f4 = FormControl("Day", DatePicker("day"))',
  'f5 = FormControl("Guests", Slider("guests", "discrete", 1, 10, 1, [2]))',
  'f6 = FormControl("Extras", CheckBoxGroup("extras", [breakfast, parking]))',
  'breakfast = CheckBoxItem("Breakfast", "Served at 8", "breakfast")',
  'parking = CheckBoxItem("Parking", "", "parking")',
  'f7 = FormControl("Size", RadioGroup("size", [small, large], "small"))',
  'small = RadioItem("Small", "", "small")',
  'large = RadioItem("Large", "", "large")',
  'f8 = FormControl("Colors", Chips("colors", "multiple", [red, blue]))',
  'red = ChipItem("red", "Red")',
  'blue = ChipItem("blue", "Blue")',
  'notify = SwitchGroup("notify", [mail])',
  'mail = SwitchItem("Email me", "", "mail")',
  'notes = Label("Notes")',
  'greet = TextContent("Hello " + $name)',
  'nameField = Input("name", "Name", "text", null, $name)',
].join('\n');

function control<Element extends HTMLElement>(root: HTMLElement, selector: string, kind: new () => Element): Element {
  const found = root.querySelector(selector);
  expect(found, selector).toBeInstanceOf(kind);
  return found as Element;
}

describe('OpenUI form controls (06 §6.1, ADR 0124, 14, 16)', () => {
  it('M5.18-H5 each form control draws, keeps what the person sets, and a bound control updates what reads it', async () => {
    const { app } = await mountOpenui(controls, vi.fn());
    const root = app.root;
    for (const words of ['Title', 'Bio', 'Room', 'Day', 'Guests', 'Extras', 'Served at 8', 'Size', 'Colors', 'Email me', 'Notes', 'Hello Ada']) expect(app.text()).toContain(words);

    await type(control(root, 'input[name="title"]', HTMLInputElement), 'Captain');
    expect(control(root, 'input[name="title"]', HTMLInputElement).value).toBe('Captain');
    await type(control(root, 'textarea[name="bio"]', HTMLTextAreaElement), 'Sails');
    expect(control(root, 'textarea[name="bio"]', HTMLTextAreaElement).value).toBe('Sails');
    await type(control(root, 'select[name="room"]', HTMLSelectElement), 'b');
    expect(control(root, 'select[name="room"]', HTMLSelectElement).value).toBe('b');

    const day = control(root, 'input[type="date"]', HTMLInputElement);
    await type(day, '2026-11-20');
    expect(control(root, 'input[type="date"]', HTMLInputElement).value).toBe('2026-11-20');
    const guests = control(root, 'input[type="range"]', HTMLInputElement);
    expect(guests.value).toBe('2');
    await type(guests, '5');
    expect(app.text()).toContain('5');

    const checkboxes = [...root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    expect(checkboxes.map((box) => box.checked)).toEqual([false, false]);
    await click(checkboxes[1] ?? null);
    expect([...root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].map((box) => box.checked)).toEqual([false, true]);

    const radios = () => [...root.querySelectorAll<HTMLInputElement>('input[type="radio"]')].map((radio) => radio.checked);
    expect(radios()).toEqual([true, false]);
    await click(root.querySelectorAll<HTMLInputElement>('input[type="radio"]')[1] ?? null);
    expect(radios()).toEqual([false, true]);

    const chip = (name: string) => [...root.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')].find((button) => button.textContent.trim() === name) ?? null;
    await click(chip('Blue'));
    expect(chip('Blue')?.getAttribute('aria-pressed')).toBe('true');
    expect(chip('Red')?.getAttribute('aria-pressed')).toBe('false');

    const toggle = () => control(root, 'button[role="switch"]', HTMLButtonElement);
    expect(toggle().getAttribute('aria-checked')).toBe('false');
    await click(toggle());
    expect(toggle().getAttribute('aria-checked')).toBe('true');

    await type(control(root, 'input[name="name"]', HTMLInputElement), 'Grace');
    await settle();
    expect(app.text()).toContain('Hello Grace');
    expect(app.text()).not.toContain('Hello Ada');
  });

  it("M5.18-H5 a FormControl's label names its control", async () => {
    const { app } = await mountOpenui(controls, vi.fn());
    const title = [...app.root.querySelectorAll('label')].find((label) => label.textContent.trim() === 'Title');
    const target = title?.getAttribute('for');
    expect(target).toBeTruthy();
    expect(app.root.querySelector(`[id="${target ?? ''}"]`)?.getAttribute('name')).toBe('title');
  });
});
