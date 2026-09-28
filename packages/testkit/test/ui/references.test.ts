import { jsonSchema, validateResultSchema } from '@kvman/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import { workspaceA, workspaceB } from '../hosts/harness.ts';
import { command, person, problemOf, type InstallFixture } from '../install/harness.ts';
import { disable, enable, grantsOf, query, valueOf } from '../workspaces/harness.ts';
import { openUiFixture, uiTests, type UiBuildId, type UiFixture } from './harness.ts';

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

async function validatedManifest(fixture: UiFixture, workspaceId: string, name: string): Promise<{ ok: boolean; issues: unknown[] }> {
  const manifest = fixture.runtime.registry.current().manifestOf(name);
  if (manifest === undefined) throw new Error(`${name} is not installed`);
  const answer = await query(fixture, 'kernel.validate', { workspaceId, manifest: jsonSchema.parse(manifest) }, person);
  if (typeof answer !== 'object' || answer === null || !('value' in answer)) throw new Error('kernel.validate did not answer');
  const validated = validateResultSchema.parse(answer.value);
  return { ok: validated.ok, issues: validated.issues };
}

describe('UI references against a workspace (plan 06 §6.3, ADR 0157)', uiTests, () => {
  it('M2.10-H4 enabling Loop B with Loop A enabled fails on the composite cycle', async () => {
    const fixture = await openFixture(['loop-a', 'loop-b']);
    // Loop A cannot enable through the command while loop-b.box is missing, so the given state is written directly.
    fixture.enable(workspaceA, '@acme/loop-a', grantsOf(fixture, '@acme/loop-a'));
    const problem = problemOf(await enable(fixture, workspaceA, '@acme/loop-b'));
    expect(problem.code).toBe('VALIDATION_FAILED');
    expect(problem.detail).toBe('extensions.@acme/loop-a.ui.components.0: the composites form a cycle: loop-a.box → loop-b.box → loop-a.box');
    expect(problem.issues).toEqual([{
      path: 'extensions.@acme/loop-a.ui.components.0',
      message: 'the composites form a cycle: loop-a.box → loop-b.box → loop-a.box',
      hint: 'a composite cannot contain itself, directly or through other components',
    }]);
  });

  it('M2.10-H5 enabling Twin with Kit enabled fails on the route clash', async () => {
    const fixture = await openFixture(['kit', 'twin']);
    valueOf(await enable(fixture, workspaceA, '@acme/kit'));
    const problem = problemOf(await enable(fixture, workspaceA, '@acme/route-twin'));
    expect(problem.code).toBe('ROUTE_CONFLICT');
    expect(problem.detail).toBe('extensions.@acme/route-twin.ui.pages.0.route: kit.home (/kit) and route-twin.home (/kit) open on the same route');
    expect(problem.issues).toEqual([{
      path: 'extensions.@acme/route-twin.ui.pages.0.route',
      message: 'kit.home (/kit) and route-twin.home (/kit) open on the same route',
      hint: 'change one of the routes',
    }]);
  });

  it('M2.10-H6 Shop Lite enables with inactive warnings until Kit enables', async () => {
    const fixture = await openFixture(['kit', 'shop-lite']);
    valueOf(await enable(fixture, workspaceA, '@acme/shop'));
    const before = await validatedManifest(fixture, workspaceA, '@acme/shop');
    expect(before.ok).toBe(true);
    expect(before.issues).toHaveLength(4);
    expect(before.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'meta.title', severity: 'warning', message: expect.stringContaining('literal') }),
      expect.objectContaining({
        path: 'extensions.@acme/shop.ui.panels.0.slot',
        message: 'kit.tray belongs to @acme/kit, which is not enabled here: the panel is inactive',
        severity: 'warning',
      }),
      expect.objectContaining({
        path: 'extensions.@acme/shop.ui.actions.0.entity',
        message: 'kit.item belongs to @acme/kit, which is not enabled here: the action is inactive',
        severity: 'warning',
      }),
      expect.objectContaining({
        path: 'extensions.@acme/shop.ui.renderers.0.target',
        message: 'kit.entry belongs to @acme/kit, which is not enabled here: the renderer is inactive',
        severity: 'warning',
      }),
    ]));
    valueOf(await enable(fixture, workspaceA, '@acme/kit'));
    const after = await validatedManifest(fixture, workspaceA, '@acme/shop');
    expect(after).toEqual({ ok: true, issues: [expect.objectContaining({ path: 'meta.title', severity: 'warning', message: expect.stringContaining('literal') })] });
  });

  it('M2.10-E22 a panel in kit.tray enables; a toolbar item and a missing slot prop fail', async () => {
    const panel = await openFixture(['kit', 'shop']);
    valueOf(await enable(panel, workspaceA, '@acme/kit'));
    valueOf(await enable(panel, workspaceA, '@acme/shop'));

    const toolbar = await openFixture(['kit', 'shop-toolbar']);
    valueOf(await enable(toolbar, workspaceA, '@acme/kit'));
    const toolbarProblem = problemOf(await enable(toolbar, workspaceA, '@acme/shop'));
    expect(toolbarProblem.code).toBe('VALIDATION_FAILED');
    expect(toolbarProblem.issues).toEqual([{
      path: 'extensions.@acme/shop.ui.toolbarItems.0.slot',
      message: 'kit.tray does not accept a toolbarItem',
      hint: 'kit.tray accepts panel; a toolbarItem goes in frame.topbar.start or frame.topbar.end, or an extension slot that accepts toolbarItem',
    }]);

    const slotRead = await openFixture(['kit', 'shop-slot-read']);
    valueOf(await enable(slotRead, workspaceA, '@acme/kit'));
    const slotProblem = problemOf(await enable(slotRead, workspaceA, '@acme/shop'));
    expect(slotProblem.code).toBe('VALIDATION_FAILED');
    expect(slotProblem.issues).toEqual([{
      path: 'extensions.@acme/shop.ui.panels.0.view.text',
      message: '$slot.nope does not exist in the props of kit.tray',
      hint: 'fields there: itemId',
    }]);
  });

  it('M2.10-E23 missing $item and $query paths fail at their bindings', async () => {
    const actionRead = await openFixture(['kit', 'shop-action-read']);
    valueOf(await enable(actionRead, workspaceA, '@acme/kit'));
    const actionProblem = problemOf(await enable(actionRead, workspaceA, '@acme/shop'));
    expect(actionProblem.code).toBe('VALIDATION_FAILED');
    expect(actionProblem.issues).toEqual([{
      path: 'extensions.@acme/shop.ui.actions.0.label',
      message: '$item.nope does not exist in the entity kit.item',
      hint: 'fields there: id, name',
    }]);

    const rendererRead = await openFixture(['kit', 'shop-renderer-read']);
    valueOf(await enable(rendererRead, workspaceA, '@acme/kit'));
    const rendererProblem = problemOf(await enable(rendererRead, workspaceA, '@acme/shop'));
    expect(rendererProblem.code).toBe('VALIDATION_FAILED');
    expect(rendererProblem.issues).toEqual([{
      path: 'extensions.@acme/shop.ui.renderers.0.view.text',
      message: '$item.nope does not exist in the item of kit.entry',
      hint: 'fields there: id, text',
    }]);

    const queryRead = await openFixture(['kit', 'shop-query-read']);
    valueOf(await enable(queryRead, workspaceA, '@acme/kit'));
    const queryProblem = problemOf(await enable(queryRead, workspaceA, '@acme/shop'));
    expect(queryProblem.code).toBe('VALIDATION_FAILED');
    expect(queryProblem.issues).toEqual([{
      path: 'extensions.@acme/shop.ui.pages.0.view.children.0.text',
      message: '$query.items.nope does not exist in the result of kit.items.list',
      hint: 'fields there: items',
    }]);
  });

  it('M2.10-E24 a kit.card node without its title, or with a text count, fails at its props', async () => {
    const noTitle = await openFixture(['kit', 'shop-no-title']);
    valueOf(await enable(noTitle, workspaceA, '@acme/kit'));
    const titleProblem = problemOf(await enable(noTitle, workspaceA, '@acme/shop'));
    expect(titleProblem.code).toBe('VALIDATION_FAILED');
    expect(titleProblem.issues).toEqual([{
      path: 'extensions.@acme/shop.ui.pages.0.view.title',
      message: "must have required property 'title'",
    }]);

    const badCount = await openFixture(['kit', 'shop-bad-count']);
    valueOf(await enable(badCount, workspaceA, '@acme/kit'));
    const countProblem = problemOf(await enable(badCount, workspaceA, '@acme/shop'));
    expect(countProblem.code).toBe('VALIDATION_FAILED');
    expect(countProblem.issues).toEqual([{
      path: 'extensions.@acme/shop.ui.pages.0.view.count',
      message: 'must be number',
    }]);
  });

  it('M2.10-E25 Shop needs kit.card: missing, then private, then enabled', async () => {
    const missing = await openFixture(['kit', 'shop']);
    const missingProblem = problemOf(await enable(missing, workspaceA, '@acme/shop'));
    expect(missingProblem.code).toBe('EXT_REQUIRES_MISSING');
    expect(missingProblem.issues?.[0]).toMatchObject({
      path: 'extensions.@acme/shop.permissions.requireComponents.0.components.0',
      message: 'kit.card is required, but no enabled extension provides it',
      hint: 'enable the extension that registers kit.card',
    });

    const privateCard = await openFixture(['kit-private-card', 'shop']);
    valueOf(await enable(privateCard, workspaceA, '@acme/kit'));
    const privateProblem = problemOf(await enable(privateCard, workspaceA, '@acme/shop'));
    expect(privateProblem.code).toBe('EXT_REQUIRES_MISSING');
    expect(privateProblem.issues?.[0]).toMatchObject({
      path: 'extensions.@acme/shop.permissions.requireComponents.0.components.0',
      message: 'kit.card is required, but it is private to @acme/kit',
    });

    valueOf(await enable(missing, workspaceA, '@acme/kit'));
    valueOf(await enable(missing, workspaceA, '@acme/shop'));
  });

  it('M2.10-E26 disabling or uninstalling Kit with Shop enabled fails EXT_IN_USE', async () => {
    const fixture = await openFixture(['kit', 'shop']);
    valueOf(await enable(fixture, workspaceA, '@acme/kit'));
    valueOf(await enable(fixture, workspaceA, '@acme/shop'));
    const disableProblem = problemOf(await disable(fixture, workspaceA, '@acme/kit'));
    expect(disableProblem).toMatchObject({
      code: 'EXT_IN_USE',
      detail: '@acme/shop requires @acme/kit in this workspace',
      params: { dependents: ['@acme/shop'] },
    });
    const uninstallProblem = problemOf(await command(fixture, 'kernel.extension.uninstall', { name: '@acme/kit' }, person));
    expect(uninstallProblem).toMatchObject({ code: 'EXT_IN_USE', params: { workspaces: [workspaceA] } });
  });

  it('M2.10-E27 enabling Kit checks the placements that become active', async () => {
    const fixture = await openFixture(['kit-toolbar-tray', 'shop-lite']);
    valueOf(await enable(fixture, workspaceA, '@acme/shop'));
    const problem = problemOf(await enable(fixture, workspaceA, '@acme/kit'));
    expect(problem.code).toBe('VALIDATION_FAILED');
    expect(problem.issues).toEqual([{
      path: 'extensions.@acme/shop.ui.panels.0.slot',
      message: 'kit.tray does not accept a panel',
      hint: 'kit.tray accepts toolbarItem; a panel goes in frame.overlay, or an extension slot that accepts panel',
    }]);
  });

  it('M2.10-E28 enabling the ninth chained composite fails on nesting depth', async () => {
    const fixture = await openFixture(['chain-1', 'chain-2', 'chain-3', 'chain-4', 'chain-5', 'chain-6', 'chain-7', 'chain-8', 'chain-9']);
    for (const name of ['@acme/chain-1', '@acme/chain-2', '@acme/chain-3', '@acme/chain-4', '@acme/chain-5', '@acme/chain-6', '@acme/chain-7', '@acme/chain-8']) {
      valueOf(await enable(fixture, workspaceA, name));
    }
    const problem = problemOf(await enable(fixture, workspaceA, '@acme/chain-9'));
    expect(problem.code).toBe('VALIDATION_FAILED');
    expect(problem.issues).toEqual([{
      path: 'extensions.@acme/chain-9.ui.components.0',
      message: 'chain-9.box nests 9 composite levels; at most 8 are allowed',
      hint: 'flatten the composites',
    }]);
  });

  it('M2.10-E29 wildcard routes clash per workspace; Twin in B has no clash', async () => {
    const fixture = await openFixture(['kit', 'twin', 'files-a', 'files-b']);
    valueOf(await enable(fixture, workspaceA, '@acme/kit'));
    valueOf(await enable(fixture, workspaceB, '@acme/route-twin'));
    valueOf(await enable(fixture, workspaceA, '@acme/files-a'));
    const problem = problemOf(await enable(fixture, workspaceA, '@acme/files-b'));
    expect(problem.code).toBe('ROUTE_CONFLICT');
    expect(problem.issues).toEqual([{
      path: 'extensions.@acme/files-b.ui.pages.0.route',
      message: 'files-a.home (/files/:a) and files-b.home (/files/:b) open on the same route',
      hint: 'change one of the routes',
    }]);
  });

  it('M2.10-E30 a missing component and a route clash report EXT_REQUIRES_MISSING with both issues', async () => {
    const fixture = await openFixture(['kit', 'twin', 'shop-clash']);
    valueOf(await enable(fixture, workspaceA, '@acme/route-twin'));
    const problem = problemOf(await enable(fixture, workspaceA, '@acme/shop'));
    expect(problem.code).toBe('EXT_REQUIRES_MISSING');
    expect(problem.issues?.[0]).toMatchObject({
      path: 'extensions.@acme/shop.permissions.requireComponents.0.components.0',
      message: 'kit.card is required, but no enabled extension provides it',
      hint: 'enable the extension that registers kit.card',
    });
    expect(problem.issues?.[1]).toMatchObject({
      path: 'extensions.@acme/shop.ui.pages.0.route',
      message: 'route-twin.home (/kit) and shop.home (/kit) open on the same route',
      hint: 'change one of the routes',
    });
  });
});
