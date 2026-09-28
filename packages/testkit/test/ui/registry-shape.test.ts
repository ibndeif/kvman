import { frameSlots, uiRegistrySchema } from '@kvman/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import { workspaceA } from '../hosts/harness.ts';
import { disable, enable, openFolderAsWorkspace, temporaryFolder, valueOf } from '../workspaces/harness.ts';
import { boardFixture, answer, registry } from './registry-harness.ts';
import { helpPreset } from './registry-preset.ts';
import { uiTests, type UiFixture } from './harness.ts';

let fixture: UiFixture | undefined;
afterEach(async () => { await fixture?.close(); fixture = undefined; });

describe('registry shape', uiTests, () => {
  it('M2.11-E20 supplies the complete default frame and app', async () => {
    fixture = await boardFixture();
    const current = uiRegistrySchema.parse(await registry(fixture));
    expect(current.app).toEqual({ title: 'Test', home: '/board', themeMode: 'system' });
    expect(current.layout).toEqual({ sidebar: 'expanded', statusbar: 'shown' });
    for (const slot of frameSlots) {
      expect(current.slots[slot.name]).toEqual({ owner: 'frame', accepts: slot.accepts, ...(slot.max === undefined ? {} : { max: slot.max }), items: expect.any(Array) });
    }
    expect(current.slots['frame.main']?.items).toEqual([]);
    expect(current.extensions).toEqual({ '@acme/board': { namespace: 'board', title: '$t.meta.title' } });
  });

  it('M2.11-E27 lists pages, components, settings, and catalogs by owner', async () => {
    fixture = await boardFixture(['board', 'kit']);
    valueOf(await enable(fixture, workspaceA, '@acme/kit'));
    await helpPreset(fixture);
    const current = uiRegistrySchema.parse(await registry(fixture));
    expect(current.pages).toEqual([
      { id: 'board.card', owner: '@acme/board', route: '/board/:cardId', title: '$t.page.card', hidden: false },
      { id: 'board.home', owner: '@acme/board', route: '/board', title: '$t.page.home', hidden: false },
      { id: 'kit.home', owner: '@acme/kit', route: '/kit', title: 'Kit', hidden: false },
      { id: 'preset.help', owner: 'preset', route: '/help', title: '$t.help.title', hidden: false },
    ]);
    expect(current.components.map(({ name, owner, form, visibility, def }) => ({ name, owner, form, visibility, ...(def === undefined ? {} : { def }) }))).toEqual([
      { name: 'board.chip', owner: '@acme/board', form: 'composite', visibility: 'private', def: expect.objectContaining({ description: 'A board chip.', view: { type: 'text', text: '$props.title' } }) },
      { name: 'board.frame', owner: '@acme/board', form: 'composite', visibility: 'private' },
      { name: 'kit.card', owner: '@acme/kit', form: 'composite', visibility: 'public' },
      { name: 'kit.secret', owner: '@acme/kit', form: 'composite', visibility: 'private' },
    ]);
    const config = fixture.runtime.registry.current().manifestOf('@acme/board')?.config;
    expect(current.settingsSections).toEqual([{ id: 'settings.section.board', owner: '@acme/board', title: '$t.meta.title', scopes: ['global', 'workspace'], schema: config?.schema, view: { type: 'text', text: '$t.settings.intro' } }]);
    expect(current.catalogs).toEqual({ defaults: { '@acme/board': 'en', preset: 'en' }, locales: ['ar', 'en'] });
  });

  it('M2.11-E28 refuses absent presets and unknown workspaces, and drops disabled Board', async () => {
    fixture = await boardFixture();
    const workspaceC = await openFolderAsWorkspace(fixture, temporaryFolder('board-c'));
    for (const [type, payload] of [
      ['kernel.ui.get', { workspaceId: workspaceC }],
      ['kernel.ui.page.get', { workspaceId: workspaceC, pageId: 'board.home' }],
      ['kernel.ui.translations.get', { workspaceId: workspaceC }],
    ] as const) expect(await answer(fixture, type, payload)).toMatchObject({ ok: false, problem: { code: 'PRESET_REQUIRED' } });
    valueOf(await disable(fixture, workspaceA, '@acme/board'));
    const current = uiRegistrySchema.parse(await registry(fixture));
    expect(current.pages).toEqual([]);
    expect(Object.values(current.slots).flatMap((slot) => slot.items)).toEqual([]);
    expect(current.components).toEqual([]);
    expect(current.catalogs).toEqual({ defaults: {}, locales: [] });
    expect(current.extensions).toEqual({});
    expect(await answer(fixture, 'kernel.ui.get', { workspaceId: 'f'.repeat(64) })).toMatchObject({ ok: false, problem: { code: 'WORKSPACE_INVALID' } });
  });
});
