import { describe, expect, it } from 'vitest';
import { shownPath } from '../../web/src/state/shown-path.ts';
import { click, mountApp } from './support/mount-app.ts';
import { notesApi } from './support/notes.ts';

describe("the status bar's workspace folder (06 §6.2, ADR 0009, 145)", () => {
  it('QA3-H8 the first status item is the workspace folder, with the home folder as ~, and it follows a switch', async () => {
    const api = notesApi();
    api.workspaces.push({ id: 'w1', name: 'todo', path: '/home/ahmed/dev/todo' }, { id: 'w2', name: 'elsewhere', path: '/srv/site' });
    const app = await mountApp(api, '/notes/list');
    const folder = () => app.find('[data-test="status-workspace"]');
    expect(app.find('[data-test="status-bar"]')?.firstElementChild).toBe(folder());
    expect(folder()?.textContent).toContain('~');
    await click(app.find('button[aria-label^="Workspace:"]'));
    await click(app.find('[data-test="workspace-w1"]'));
    expect(folder()?.textContent).toContain('~/dev/todo');
    expect(folder()?.getAttribute('title')).toBe('/home/ahmed/dev/todo');
    await click(app.find('button[aria-label^="Workspace:"]'));
    await click(app.find('[data-test="workspace-w2"]'));
    expect(folder()?.textContent).toContain('/srv/site');
    expect(folder()?.textContent).not.toContain('~');
  });

  it('QA3-E11 the home folder itself is ~, a folder outside it is whole, and a Windows folder under it shows ~\\…', () => {
    expect(shownPath('/home/ahmed', '/home/ahmed')).toBe('~');
    expect(shownPath('/home/ahmed2/dev', '/home/ahmed')).toBe('/home/ahmed2/dev');
    expect(shownPath('/srv/site', '/home/ahmed')).toBe('/srv/site');
    expect(shownPath('C:\\Users\\ahmed\\dev\\todo', 'C:\\Users\\ahmed')).toBe('~\\dev\\todo');
    expect(shownPath('C:\\Users\\ahmed', 'C:\\Users\\ahmed')).toBe('~');
    expect(shownPath('/anywhere', undefined)).toBe('/anywhere');
  });
});
