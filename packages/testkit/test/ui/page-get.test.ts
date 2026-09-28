import { afterEach, describe, expect, it } from 'vitest';
import { workspaceA } from '../hosts/harness.ts';
import { command, person } from '../install/harness.ts';
import { disable, enable, valueOf } from '../workspaces/harness.ts';
import { boardFixture, answer, page, patch } from './registry-harness.ts';
import { helpPreset } from './registry-preset.ts';
import { uiTests, type UiFixture } from './harness.ts';

let fixture: UiFixture | undefined;
afterEach(async () => { await fixture?.close(); fixture = undefined; });

describe('page views', uiTests, () => {
  it('M2.11-E29 answers hidden pages with transitive composites and refuses inactive pages', async () => {
    fixture = await boardFixture(['board', 'kit']);
    valueOf(await enable(fixture, workspaceA, '@acme/kit'));
    await helpPreset(fixture);
    await patch(fixture, workspaceA, {
      hidden: ['board.home'],
      pages: [{ name: 'help', description: 'Help page.', route: '/help', title: '$t.help.title', view: { type: 'kit.card', title: '$t.help.card' } }],
    });
    expect(await page(fixture, 'board.home')).toEqual({
      page: { description: 'The board home.', route: '/board', title: '$t.page.home', view: { type: 'board.frame' } },
      components: [
        { name: 'board.chip', owner: '@acme/board', def: expect.objectContaining({ description: 'A board chip.', view: { type: 'text', text: '$props.title' } }) },
        { name: 'board.frame', owner: '@acme/board', def: expect.objectContaining({ description: 'A board frame.', view: { type: 'board.chip', title: '$t.chip' } }) },
      ],
    });
    expect(await page(fixture, 'preset.help')).toEqual({
      page: { description: 'Help page.', route: '/help', title: '$t.help.title', view: { type: 'kit.card', title: '$t.help.card' } },
      components: [{ name: 'kit.card', owner: '@acme/kit', def: expect.objectContaining({ description: 'A kit card.', visibility: 'public' }) }],
    });
    expect(await page(fixture, 'board.card')).toEqual({ page: { description: 'A board card.', route: '/board/:cardId', title: '$t.page.card', view: { type: 'text', text: '$t.page.card' } }, components: [] });
    expect(await answer(fixture, 'kernel.ui.page.get', { workspaceId: workspaceA, pageId: 'kit.missing' })).toMatchObject({ ok: false, problem: { code: 'NOT_FOUND' } });
    await patch(fixture, workspaceA, { app: { home: '/help' } });
    valueOf(await disable(fixture, workspaceA, '@acme/board'));
    expect(await answer(fixture, 'kernel.ui.page.get', { workspaceId: workspaceA, pageId: 'board.home' })).toMatchObject({ ok: false, problem: { code: 'NOT_FOUND' } });
    valueOf(await enable(fixture, workspaceA, '@acme/board'));
    await fixture.runtime.quarantine('@acme/board', 'HOST_FAILURES');
    expect(await answer(fixture, 'kernel.ui.page.get', { workspaceId: workspaceA, pageId: 'board.home' })).toMatchObject({ ok: false, problem: { code: 'NOT_FOUND' } });
    valueOf(await command(fixture, 'kernel.extension.unquarantine', { name: '@acme/board' }, person));
  });
});
