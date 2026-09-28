import { afterEach, describe, expect, it } from 'vitest';
import { workspaceA } from '../hosts/harness.ts';
import { command, person } from '../install/harness.ts';
import { valueOf } from '../workspaces/harness.ts';
import { boardFixture, patch, registry } from './registry-harness.ts';
import { helpPreset } from './registry-preset.ts';
import { uiTests, type UiFixture } from './harness.ts';

let fixture: UiFixture | undefined;
afterEach(async () => { await fixture?.close(); fixture = undefined; });

describe('registry sidebar', uiTests, () => {
  it('M2.11-E22 flattens groups after ordered top-level items and numbers separators', async () => {
    fixture = await boardFixture();
    await helpPreset(fixture);
    await patch(fixture, workspaceA, { layout: { order: { 'frame.sidebar': ['preset.nav-help', '---', 'board.group', 'board.nav-top', '---'], 'frame.topbar.end': ['---'] } } });
    const current = await registry(fixture);
    expect(current.slots['frame.sidebar']?.items.map((item) => item.id)).toEqual(['preset.nav-help', '---1', 'board.group', 'board.nav-home', 'board.nav-top', '---2', 'preset.extras']);
    expect(current.slots['frame.sidebar']?.items.filter((item) => item.kind === 'separator')).toEqual([
      { id: '---1', owner: 'preset', kind: 'separator', def: {} },
      { id: '---2', owner: 'preset', kind: 'separator', def: {} },
    ]);
    expect(current.slots['frame.topbar.end']?.items.map((item) => item.id)).toEqual(['board.find', 'board.add']);
  });

  it('M2.11-E23 ungroups a nav item when its group is hidden or missing after reload', async () => {
    fixture = await boardFixture(['board', 'board-gone-group']);
    await helpPreset(fixture);
    await patch(fixture, workspaceA, { hidden: ['board.group'] });
    const hidden = (await registry(fixture)).slots['frame.sidebar']?.items;
    expect(hidden?.map((item) => item.id)).not.toContain('board.group');
    expect(hidden?.find((item) => item.id === 'board.nav-home')?.def).toEqual({ description: 'Board home navigation.', page: 'board.home', label: '$t.nav.home', icon: 'home', order: 200 });
    await patch(fixture, workspaceA, { hidden: [] });
    const digest = fixture.digests.get('board-gone-group');
    if (digest === undefined) throw new Error('Board 3 was not installed');
    valueOf(await command(fixture, 'kernel.extension.reload', { name: '@acme/board', digest }, person));
    const missing = (await registry(fixture)).slots['frame.sidebar']?.items;
    expect(missing?.find((item) => item.id === 'board.nav-home')?.def).toEqual({ description: 'Board home navigation.', page: 'board.home', label: '$t.nav.home', icon: 'home', order: 200 });
    expect(missing?.map((item) => item.id)).toEqual(['board.group', 'board.nav-home', 'board.nav-top', 'preset.nav-help', 'preset.extras']);
  });
});
