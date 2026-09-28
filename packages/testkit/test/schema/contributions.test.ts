import { schemaDocumentSchema, type Json, type SchemaDocument } from '@kvman/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import { workspaceA } from '../hosts/harness.ts';
import { person, type InstallFixture } from '../install/harness.ts';
import { grantsOf, query } from '../workspaces/harness.ts';
import { openUiFixture, uiTests, type UiBuildId, type UiFixture } from '../ui/harness.ts';

let opened: InstallFixture[] = [];

afterEach(async () => {
  for (const fixture of opened) await fixture.close();
  opened = [];
});

async function openFixture(builds: readonly UiBuildId[]): Promise<UiFixture> {
  const fixture = await openUiFixture(builds);
  opened.push(fixture);
  return fixture;
}

async function schemaOf(fixture: UiFixture, request: Json): Promise<SchemaDocument> {
  const answer = await query(fixture, 'kernel.schema.get', request, person);
  if (typeof answer !== 'object' || answer === null || !('value' in answer)) throw new Error('kernel.schema.get did not answer');
  return schemaDocumentSchema.parse(answer.value);
}

describe('the schema endpoint contributions (ADR 0158)', uiTests, () => {
  it('M2.10-E37 /schema lists UI entries and public components, per workspace and searched', async () => {
    const fixture = await openFixture(['kit', 'shop']);
    // Shop requires kit.card, so the command cannot enable it while Kit stays off: the given state is written directly.
    fixture.enable(workspaceA, '@acme/shop', grantsOf(fixture, '@acme/shop'));

    const document = await schemaOf(fixture, {});
    expect(document.contributions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'kit.home', kind: 'page', owner: '@acme/kit', target: '/kit' }),
      expect.objectContaining({ id: 'kit.tray', kind: 'slot', owner: '@acme/kit' }),
      expect.objectContaining({ id: 'kit.entry', kind: 'rendererTarget', owner: '@acme/kit' }),
      expect.objectContaining({ id: 'shop.home', kind: 'page', owner: '@acme/shop', target: '/shop' }),
      expect.objectContaining({ id: 'shop.tip', kind: 'panel', owner: '@acme/shop', target: 'kit.tray' }),
      expect.objectContaining({ id: 'shop.inspect', kind: 'action', owner: '@acme/shop', target: 'kit.item' }),
      expect.objectContaining({ id: 'shop.line', kind: 'renderer', owner: '@acme/shop', target: 'kit.entry' }),
    ]));
    const tray = document.contributions.find((entry) => entry.id === 'kit.tray');
    expect(tray?.schema).toMatchObject({ properties: { itemId: { type: 'string' } } });
    const target = document.contributions.find((entry) => entry.id === 'kit.entry');
    expect(target?.schema).toMatchObject({ properties: { id: { type: 'string' }, text: { type: 'string' } } });
    expect(document.components).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'kit.card', owner: '@acme/kit', form: 'composite',
        events: { onAction: { description: 'onAction' } }, children: 'any', examples: [],
      }),
    ]));
    expect(document.components.map((entry) => entry.name)).not.toContain('kit.secret');

    const inA = await schemaOf(fixture, { workspaceId: workspaceA });
    expect(inA.contributions.map((entry) => entry.id).sort()).toEqual(['shop.home', 'shop.inspect', 'shop.line', 'shop.tip']);

    const traySearch = await schemaOf(fixture, { q: 'tray' });
    expect(traySearch.contributions.map((entry) => entry.id)).toEqual(['kit.tray', 'shop.tip']);
  });
});
