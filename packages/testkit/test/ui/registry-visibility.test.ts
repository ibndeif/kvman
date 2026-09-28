import { afterEach, describe, expect, it } from 'vitest';
import { workspaceA } from '../hosts/harness.ts';
import { enable, valueOf } from '../workspaces/harness.ts';
import { boardFixture, patch, registry } from './registry-harness.ts';
import { helpPreset } from './registry-preset.ts';
import { uiTests, type UiFixture } from './harness.ts';

let fixture: UiFixture | undefined;
afterEach(async () => { await fixture?.close(); fixture = undefined; });

describe('registry visibility', uiTests, () => {
  it('M2.11-E24 keeps hidden pages but removes hidden contributions and cascading navigation', async () => {
    fixture = await boardFixture();
    await patch(fixture, workspaceA, { hidden: ['board.home', 'board.menu', 'board.pin', 'board.pdf', 'settings.section.board'] });
    const current = await registry(fixture);
    expect(current.pages.find((entry) => entry.id === 'board.home')).toEqual({ id: 'board.home', owner: '@acme/board', route: '/board', title: '$t.page.home', hidden: true });
    expect(current.slots['frame.sidebar']?.items.map((item) => item.id)).toEqual(['board.group']);
    expect(current.slots['frame.topbar.start']?.items).toEqual([]);
    expect(current.actions).toEqual({});
    expect(current.renderers).toEqual({});
    expect(current.settingsSections).toEqual([]);
  });

  it('M2.11-E25 activates foreign targets only when Kit is enabled', async () => {
    fixture = await boardFixture(['board', 'kit']);
    const before = await registry(fixture);
    expect(before.slots['kit.tray']).toBeUndefined();
    expect(before.actions['kit.item']).toBeUndefined();
    expect(before.renderers['kit.entry']).toBeUndefined();
    expect(before.renderers['mime:application/pdf']).toEqual([{ id: 'board.pdf', owner: '@acme/board', kind: 'renderer', def: { description: 'Render a PDF.', target: 'mime:application/pdf', component: 'board.chip', props: { title: '$t.chip' } } }]);
    valueOf(await enable(fixture, workspaceA, '@acme/kit'));
    const after = await registry(fixture);
    expect(after.slots['kit.tray']).toEqual({ owner: '@acme/kit', accepts: ['panel'], items: [{ id: 'board.side', owner: '@acme/board', kind: 'panel', def: { description: 'Board side.', slot: 'kit.tray', title: '$t.panel.side', view: { type: 'text', text: '$t.panel.side' } } }] });
    expect(after.actions['kit.item']).toEqual([{ id: 'board.pin', owner: '@acme/board', kind: 'action', def: { description: 'Pin a kit item.', entity: 'kit.item', label: '$t.action.pin', navigate: '/board' } }]);
    expect(after.renderers['kit.entry']).toEqual([{ id: 'board.row', owner: '@acme/board', kind: 'renderer', def: { description: 'Render a kit entry.', target: 'kit.entry', view: { type: 'text', text: '$item.text' } } }]);
  });

  it('M2.11-E26 carries preset labels beside unchanged definitions and titles', async () => {
    fixture = await boardFixture();
    await helpPreset(fixture);
    await patch(fixture, workspaceA, { labels: { 'board.nav-top': { en: 'Top', ar: 'الأعلى' }, 'board.home': '$t.labels.home', 'settings.section.board': 'Board settings' } });
    const current = await registry(fixture);
    expect(current.slots['frame.sidebar']?.items.find((item) => item.id === 'board.nav-top')).toEqual({
      id: 'board.nav-top', owner: '@acme/board', kind: 'navItem', label: { en: 'Top', ar: 'الأعلى' },
      def: { description: 'Top-level board navigation.', page: 'board.home', label: '$t.nav.top', icon: 'star', order: 300 },
    });
    expect(current.pages.find((entry) => entry.id === 'board.home')).toEqual({ id: 'board.home', owner: '@acme/board', route: '/board', title: '$t.page.home', hidden: false, label: '$t.labels.home' });
    expect(current.settingsSections[0]).toMatchObject({ title: '$t.meta.title', label: 'Board settings', view: { type: 'text', text: '$t.settings.intro' } });
  });
});
