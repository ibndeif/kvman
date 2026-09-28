import { afterEach, describe, expect, it } from 'vitest';
import { workspaceA, workspaceB } from '../hosts/harness.ts';
import { command, person, problemOf, type InstallFixture } from '../install/harness.ts';
import { enable, valueOf } from '../workspaces/harness.ts';
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

function digestOf(fixture: UiFixture, build: UiBuildId): string {
  const digest = fixture.digests.get(build);
  if (digest === undefined) throw new Error(`${build} is not installed in this fixture`);
  return digest;
}

describe('UI checks on reload (plan 06 §6.6, ADR 0157)', uiTests, () => {
  it('M2.10-E31 renaming kit.card title breaks dependents on reload; adding an optional prop reloads', async () => {
    const fixture = await openFixture(['kit', 'shop', 'kit-v2', 'kit-v3']);
    valueOf(await enable(fixture, workspaceA, '@acme/kit'));
    valueOf(await enable(fixture, workspaceA, '@acme/shop'));
    valueOf(await enable(fixture, workspaceB, '@acme/kit'));
    valueOf(await enable(fixture, workspaceB, '@acme/shop'));

    const refused = problemOf(await command(fixture, 'kernel.extension.reload', { name: '@acme/kit', digest: digestOf(fixture, 'kit-v2') }, person));
    expect(refused.code).toBe('VALIDATION_FAILED');
    expect(refused.detail).toBe('the new version would break a workspace where the extension is enabled');
    expect(refused.issues).toHaveLength(2);
    for (const workspaceId of [workspaceA, workspaceB]) {
      expect(refused.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({
          path: `workspaces.${workspaceId}.extensions.@acme/shop.ui.pages.0.view.heading`,
          message: "must have required property 'heading'",
        }),
      ]));
    }
    expect(fixture.runtime.registry.current().manifestOf('@acme/kit')?.meta.version).toBe('1.0.0');
    expect(fixture.runtime.registry.current().isReloading('@acme/kit')).toBe(false);

    const digestV3 = digestOf(fixture, 'kit-v3');
    expect(valueOf(await command(fixture, 'kernel.extension.reload', { name: '@acme/kit', digest: digestV3 }, person))).toEqual({ digest: digestV3 });
    expect(fixture.runtime.registry.current().manifestOf('@acme/kit')?.meta.version).toBe('3.0.0');
  });

  it('M2.10-E32 reloading Kit onto a page targeting an internal type fails at the page', async () => {
    const fixture = await openFixture(['kit', 'shop', 'kit-shop-secret']);
    valueOf(await enable(fixture, workspaceA, '@acme/kit'));
    valueOf(await enable(fixture, workspaceA, '@acme/shop'));
    const problem = problemOf(await command(fixture, 'kernel.extension.reload', { name: '@acme/kit', digest: digestOf(fixture, 'kit-shop-secret') }, person));
    expect(problem.code).toBe('VALIDATION_FAILED');
    expect(problem.detail).toBe('the new version would break a workspace where the extension is enabled');
    expect(problem.issues).toEqual([{
      path: `workspaces.${workspaceA}.extensions.@acme/kit.ui.pages.0.view.children.0.onClick.command`,
      message: 'shop.secret has access "internal"; a view\'s sender is the person',
      hint: 'target a type with access "all" or "user"',
    }]);
    expect(fixture.runtime.registry.current().manifestOf('@acme/kit')?.meta.version).toBe('1.0.0');
  });
});
