import { describe, expect, it, vi } from 'vitest';
import { renderStarting, startHome } from '../src/home.ts';
import { readHomeView } from '../src/shell.ts';
import { dataRow, fakeShell, homeRow, mount, notesRow, readCatalog, viewOf } from './support.ts';

const texts = (root: HTMLElement, selector: string): string[] => [...root.querySelectorAll(selector)].map((found) => found.textContent);

function button(root: HTMLElement, selector: string): HTMLButtonElement {
  const found = root.querySelector<HTMLButtonElement>(selector);
  if (found === null) throw new Error(`The page has no ${selector}.`);
  return found;
}

describe('the home screen (14 §14.5)', () => {
  it('M3.2-H4 shows the title, Home first, each workspace with its folder, and "Open a folder…"', async () => {
    const root = mount();
    await startHome(root, fakeShell(viewOf()));
    expect(texts(root, 'h1')).toEqual(['Choose a workspace']);
    expect(texts(root, '.row-name')).toEqual(['Home', 'notes', 'data']);
    expect(texts(root, '.row-folder')).toEqual(['~', '~/work/notes', '/srv/data']);
    expect(button(root, '.open-folder').textContent).toBe('Open a folder…');
    expect(root.querySelector('.failure')).toBeNull();
  });

  it('M3.2-H5 a click on a row asks the shell to continue with its id', async () => {
    const root = mount();
    const shell = fakeShell(viewOf());
    await startHome(root, shell);
    button(root, `[data-workspace="${notesRow.id}"]`).click();
    expect(shell.continueInto.mock.calls).toEqual([[notesRow.id]]);
    button(root, '[data-workspace="home"]').click();
    expect(shell.continueInto.mock.calls).toEqual([[notesRow.id], ['home']]);
  });

  it('M3.2-H6 the remove button asks the shell to remove, shows the list it answers, and Home has none', async () => {
    const root = mount();
    const shell = fakeShell(viewOf(), viewOf({ rows: [homeRow, dataRow] }));
    await startHome(root, shell);
    expect(root.querySelectorAll('[data-remove]')).toHaveLength(2);
    expect(root.querySelector('[data-remove="home"]')).toBeNull();
    button(root, `[data-remove="${notesRow.id}"]`).click();
    await vi.waitFor(() => expect(texts(root, '.row-name')).toEqual(['Home', 'data']));
    expect(shell.remove.mock.calls).toEqual([[notesRow.id]]);
  });

  it('M3.2-H8 a failure is shown above the list, and the list stays', async () => {
    const root = mount();
    const shell = fakeShell(viewOf(), viewOf({ failure: 'No workspace was found.' }));
    await startHome(root, shell);
    button(root, `[data-remove="${notesRow.id}"]`).click();
    await vi.waitFor(() => expect(texts(root, '[role="alert"]')).toEqual(['No workspace was found.']));
    expect(texts(root, '.row-name')).toEqual(['Home', 'notes', 'data']);
    const failure = root.querySelector('.failure');
    expect(failure?.compareDocumentPosition(button(root, '[data-workspace="home"]'))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('M3.2-H9 Arabic is shown right to left, and English left to right', async () => {
    const root = mount();
    await startHome(root, fakeShell(viewOf({ language: 'ar' })));
    expect(document.documentElement.lang).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(texts(root, 'h1')).toEqual([readCatalog('ar')['desktop.home.title']]);
    expect(texts(root, '.row-name')[0]).toBe(readCatalog('ar')['desktop.home.home']);
    await startHome(root, fakeShell(viewOf({ language: 'en' })));
    expect(document.documentElement.lang).toBe('en');
    expect(document.documentElement.dir).toBe('ltr');
    expect(texts(root, 'h1')).toEqual(['Choose a workspace']);
  });

  it('M3.2-H10 light and dark are carried as the theme, and system carries none', async () => {
    const root = mount();
    for (const theme of ['light', 'dark'] as const) {
      await startHome(root, fakeShell(viewOf({ theme })));
      expect(document.documentElement.dataset['theme']).toBe(theme);
    }
    await startHome(root, fakeShell(viewOf({ theme: 'system' })));
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('M3.2-E23 every row is a button that names what it does, and the starting state has no sentence', async () => {
    const root = mount();
    renderStarting(root);
    expect(root.textContent).toBe('kvman');
    expect(root.querySelectorAll('[role="progressbar"]')).toHaveLength(1);
    expect(root.querySelectorAll('button')).toHaveLength(0);
    await startHome(root, fakeShell(viewOf()));
    expect([...root.querySelectorAll('.row-open, .row-remove, .open-folder')].every((found) => found instanceof HTMLButtonElement && found.type === 'button')).toBe(true);
    expect(button(root, `[data-remove="${notesRow.id}"]`).getAttribute('aria-label')).toBe('Remove notes');
    expect(root.querySelector('[role="progressbar"]')).toBeNull();
  });

  it('M3.2-E27 an answer of another shape is refused', () => {
    expect(readHomeView(viewOf())).toEqual(viewOf());
    for (const wrong of [null, [], { ...viewOf(), language: 'fr' }, { ...viewOf(), theme: 'blue' }, { ...viewOf(), rows: [{ id: 'x' }] }, { ...viewOf(), failure: 5 }, { ...viewOf(), texts: { key: 1 } }]) {
      expect(() => readHomeView(wrong)).toThrow(TypeError);
    }
  });
});
