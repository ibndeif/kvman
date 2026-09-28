import { afterEach, describe, expect, it } from 'vitest';
import { workspaceA } from '../hosts/harness.ts';
import { boardFixture, patch, registry } from './registry-harness.ts';
import { uiTests, type UiFixture } from './harness.ts';

let fixture: UiFixture | undefined;
afterEach(async () => { await fixture?.close(); fixture = undefined; });

describe('registry slots', uiTests, () => {
  it('M2.11-E21 orders slot items and preserves their registered definitions', async () => {
    fixture = await boardFixture();
    const initial = await registry(fixture);
    expect(initial.slots['frame.topbar.end']?.items.map((item) => item.id)).toEqual(['board.find', 'board.add']);
    expect(initial.slots['frame.topbar.start']?.items.map((item) => item.id)).toEqual(['board.menu']);
    expect(initial.slots['frame.statusbar.start']?.items.map((item) => item.id)).toEqual(['board.count']);
    expect(initial.slots['frame.statusbar.end']?.items.map((item) => item.id)).toEqual(['board.sync']);
    expect(initial.slots['frame.overlay']?.items.map((item) => item.id)).toEqual(['board.tip']);
    expect(initial.slots['frame.topbar.end']?.items).toEqual([
      { id: 'board.find', owner: '@acme/board', kind: 'toolbarItem', def: { description: 'Find boards.', slot: 'frame.topbar.end', as: 'button', label: '$t.toolbar.find', action: { navigate: '/board' }, order: 50 } },
      { id: 'board.add', owner: '@acme/board', kind: 'toolbarItem', def: { description: 'Add a card.', slot: 'frame.topbar.end', as: 'button', label: '$t.toolbar.add', action: { navigate: '/board' }, order: 100 } },
    ]);
    await patch(fixture, workspaceA, { layout: { order: { 'frame.topbar.end': ['board.add'] } } });
    expect((await registry(fixture)).slots['frame.topbar.end']?.items.map((item) => item.id)).toEqual(['board.add', 'board.find']);
  });
});
