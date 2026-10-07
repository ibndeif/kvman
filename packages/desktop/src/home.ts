import type { HomeRow, HomeView, Shell } from './shell.ts';

// The home screen (plan 14 §14.5): the workspaces to continue into, a remove button on each but Home, and "Open a
// folder…". While kvman starts it shows only the name and a progress mark, since the language isn't known yet.

function element<Tag extends keyof HTMLElementTagNameMap>(tag: Tag, className: string, text?: string): HTMLElementTagNameMap[Tag] {
  const created = document.createElement(tag);
  created.className = className;
  if (text !== undefined) created.textContent = text;
  return created;
}

function textOf(view: HomeView, key: string, params: Readonly<Record<string, string>> = {}): string {
  return Object.entries(params).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, value), view.texts[key] ?? key);
}

function applyLook(view: HomeView): void {
  const page = document.documentElement;
  page.lang = view.language;
  page.dir = view.language === 'ar' ? 'rtl' : 'ltr';
  if (view.theme === 'system') delete page.dataset['theme'];
  else page.dataset['theme'] = view.theme;
}

export function renderStarting(root: HTMLElement): void {
  const mark = element('div', 'progress');
  mark.setAttribute('role', 'progressbar');
  root.replaceChildren(element('h1', 'brand', 'kvman'), mark);
}

function rowOf(view: HomeView, row: HomeRow, show: (next: Promise<HomeView>) => void, shell: Shell): HTMLLIElement {
  const item = element('li', 'row');
  const open = element('button', 'row-open');
  open.type = 'button';
  open.dataset['workspace'] = row.id;
  open.append(element('span', 'row-name', row.home ? textOf(view, 'desktop.home.home') : row.name), element('span', 'row-folder', row.folder));
  open.addEventListener('click', () => void shell.continueInto(row.id));
  item.append(open);
  if (row.home) return item;
  const remove = element('button', 'row-remove', '✕');
  remove.type = 'button';
  remove.dataset['remove'] = row.id;
  remove.setAttribute('aria-label', textOf(view, 'desktop.home.remove', { name: row.name }));
  remove.addEventListener('click', () => show(shell.remove(row.id)));
  item.append(remove);
  return item;
}

export function renderHome(root: HTMLElement, view: HomeView, shell: Shell): void {
  applyLook(view);
  const show = (next: Promise<HomeView>): void => {
    void next.then((changed) => renderHome(root, changed, shell));
  };
  const list = element('ul', 'rows');
  list.append(...view.rows.map((row) => rowOf(view, row, show, shell)));
  const openFolder = element('button', 'open-folder', textOf(view, 'desktop.home.openFolder'));
  openFolder.type = 'button';
  openFolder.addEventListener('click', () => show(shell.openFolder()));
  const parts: HTMLElement[] = [element('h1', 'title', textOf(view, 'desktop.home.title'))];
  if (view.failure !== null) {
    const failure = element('p', 'failure', view.failure);
    failure.setAttribute('role', 'alert');
    parts.push(failure);
  }
  root.replaceChildren(...parts, list, openFolder);
}

export async function startHome(root: HTMLElement, shell: Shell): Promise<void> {
  renderStarting(root);
  renderHome(root, await shell.load(), shell);
}
