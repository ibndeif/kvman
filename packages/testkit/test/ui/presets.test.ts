import { readAppliedPreset, writeAppliedPreset, writeCatalogPreset } from '@kvman/kernel';
import { applyPreviewSchema, jsonSchema, presetSchema, validateResultSchema, type Json, type Preset } from '@kvman/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import { workspaceA } from '../hosts/harness.ts';
import { person, problemOf, type InstallFixture } from '../install/harness.ts';
import { query, valueOf } from '../workspaces/harness.ts';
import { applyPreset, stageApply, updatePreset } from '../presets/harness.ts';
import { openUiFixture, presetEntry, uiTests, type UiBuildId, type UiFixture } from './harness.ts';

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

// The H8 preset: Kit enabled with hidden ids, labels, layout order, a preset page, a nav item, and the given home.
function kitPreset(fixture: InstallFixture, overrides: Partial<Preset> = {}): Preset {
  return presetSchema.parse({
    presetVersion: 1, id: 'kit-app', name: 'Kit App', revision: 1,
    app: { title: 'Kit App', home: '/kit' },
    extensions: { '@acme/kit': presetEntry(fixture, '@acme/kit') },
    pages: [{ name: 'welcome', description: 'Welcome here.', route: '/welcome', title: 'Welcome', view: { type: 'markdown', source: 'Welcome.' } }],
    nav: [{ name: 'home', description: 'Home.', page: 'kit.home', label: 'Home', icon: 'home' }],
    hidden: ['kit.home', 'nope.x'],
    labels: { 'nope.y': 'Y' },
    layout: { order: { 'frame.sidebar': ['kit.nav', '---'], 'nope.slot': [] } },
    ...overrides,
  });
}

async function stagedById(fixture: UiFixture, preset: Preset): Promise<string> {
  writeCatalogPreset(fixture.connection, preset, false, fixture.timers.time.value);
  return applyPreviewSchema.parse(valueOf(await stageApply(fixture, workspaceA, { presetId: preset.id }))).confirmationToken;
}

async function validatedPreset(fixture: UiFixture, preset: Preset): Promise<{ ok: boolean; issues: Array<{ path: string; message: string; severity?: string }> }> {
  const answer = await query(fixture, 'kernel.validate', { workspaceId: workspaceA, preset: jsonSchema.parse(preset) }, person);
  if (typeof answer !== 'object' || answer === null || !('value' in answer)) throw new Error('kernel.validate did not answer');
  const validated = validateResultSchema.parse(answer.value);
  return { ok: validated.ok, issues: validated.issues.map((issue) => ({ path: issue.path, message: issue.message, ...(issue.severity === undefined ? {} : { severity: issue.severity }) })) };
}

async function validatedPage(fixture: UiFixture, page: Json): Promise<{ ok: boolean; issues: Array<{ path: string; message: string }> }> {
  const answer = await query(fixture, 'kernel.validate', { workspaceId: workspaceA, page }, person);
  if (typeof answer !== 'object' || answer === null || !('value' in answer)) throw new Error('kernel.validate did not answer');
  const validated = validateResultSchema.parse(answer.value);
  return { ok: validated.ok, issues: validated.issues.map((issue) => ({ path: issue.path, message: issue.message })) };
}

describe('UI presets against a workspace (plan 07 §§7.3–7.4, ADR 0157)', uiTests, () => {
  it('M2.10-H8 staging and applying the Kit preset succeeds; unknown ids validate as warnings', async () => {
    const fixture = await openFixture(['kit']);
    const preset = kitPreset(fixture);
    const token = await stagedById(fixture, preset);
    expect(await applyPreset(fixture, token)).toEqual({ ok: true, value: { revision: 2 } });
    const validated = await validatedPreset(fixture, preset);
    expect(validated.ok).toBe(true);
    expect(validated.issues).toEqual(expect.arrayContaining([
      { path: 'hidden.1', message: 'nothing enabled here has the id nope.x', severity: 'warning' },
      { path: 'labels.nope.y', message: 'nothing enabled here has the id nope.y', severity: 'warning' },
      { path: 'layout.order.nope.slot', message: 'nope.slot is not a slot of the frame or of an enabled extension', severity: 'warning' },
    ]));
  });

  it('M2.10-E33 a nav item and a home naming nothing fail staging; a home with a param fails the preset schema', async () => {
    const fixture = await openFixture(['kit']);
    const navPreset = kitPreset(fixture, { nav: [{ name: 'home', description: 'Home.', page: 'nope.page', label: 'Home', icon: 'home' }] });
    writeCatalogPreset(fixture.connection, navPreset, false, fixture.timers.time.value);
    const navProblem = problemOf(await stageApply(fixture, workspaceA, { presetId: navPreset.id }));
    expect(navProblem.code).toBe('PRESET_REFERENCE_MISSING');
    expect(navProblem.issues?.[0]).toMatchObject({ path: 'nav.0.page', message: 'no active page has the id nope.page' });

    const homePreset = kitPreset(fixture, { app: { title: 'Kit App', home: '/nowhere' } });
    writeCatalogPreset(fixture.connection, homePreset, false, fixture.timers.time.value);
    const homeProblem = problemOf(await stageApply(fixture, workspaceA, { presetId: homePreset.id }));
    expect(homeProblem.code).toBe('PRESET_REFERENCE_MISSING');
    expect(homeProblem.issues?.[0]).toMatchObject({ path: 'app.home', message: 'no active page opens on /nowhere' });

    // A home with a :param is schema-invalid, so the raw JSON is staged: the catalog path parses rows on read.
    const paramPreset = jsonSchema.parse({ ...kitPreset(fixture), app: { title: 'Kit App', home: '/kit/:id' } });
    const paramProblem = problemOf(await stageApply(fixture, workspaceA, { json: paramPreset }));
    expect(paramProblem.code).toBe('PRESET_INVALID');
    expect(paramProblem.issues?.[0]).toMatchObject({ path: 'app.home' });
  });

  it('M2.10-E34 a preset page on /kit clashes; a declared query passes; an extensions-only target fails', async () => {
    const fixture = await openFixture(['kit']);
    const clashPreset = kitPreset(fixture, {
      pages: [{ name: 'clash', description: 'Clash.', route: '/kit', title: 'Clash', view: { type: 'markdown', source: 'Clash.' } }],
    });
    writeCatalogPreset(fixture.connection, clashPreset, false, fixture.timers.time.value);
    const clashProblem = problemOf(await stageApply(fixture, workspaceA, { presetId: clashPreset.id }));
    expect(clashProblem.code).toBe('ROUTE_CONFLICT');
    expect(clashProblem.issues?.[0]).toMatchObject({
      path: 'pages.0.route',
      message: 'kit.home (/kit) and preset.clash (/kit) open on the same route',
    });

    const queryPreset = kitPreset(fixture, {
      pages: [{
        name: 'query', description: 'Query.', route: '/query', title: 'Query',
        queries: { items: { query: 'kit.items.list' } },
        view: { type: 'stack', children: [{ type: 'text', text: '$query.items.items.0.name' }] },
      }],
    });
    writeCatalogPreset(fixture.connection, queryPreset, false, fixture.timers.time.value);
    const queryToken = applyPreviewSchema.parse(valueOf(await stageApply(fixture, workspaceA, { presetId: queryPreset.id }))).confirmationToken;
    expect(await applyPreset(fixture, queryToken)).toEqual({ ok: true, value: { revision: 2 } });

    const cachePreset = kitPreset(fixture, {
      pages: [{
        name: 'cache', description: 'Cache.', route: '/cache', title: 'Cache',
        view: { type: 'stack', children: [{ type: 'button', label: 'Clear', onClick: { command: 'kit.cache.clear' } }] },
      }],
    });
    writeCatalogPreset(fixture.connection, cachePreset, false, fixture.timers.time.value);
    const cacheProblem = problemOf(await stageApply(fixture, workspaceA, { presetId: cachePreset.id }));
    expect(cacheProblem.code).toBe('VALIDATION_FAILED');
    expect(cacheProblem.issues?.[0]).toMatchObject({
      path: 'pages.0.view.children.0.onClick.command',
      message: 'kit.cache.clear has access "extensions"; a view\'s sender is the person',
    });
  });

  it('M2.10-E35 updating the home to nowhere fails; hiding an unknown id applies as a warning', async () => {
    const fixture = await openFixture(['kit']);
    writeAppliedPreset(fixture.connection, workspaceA, presetSchema.parse({
      presetVersion: 1, id: 'kit-app', name: 'Kit App', revision: 1,
      app: { title: 'Kit App', home: '/kit' },
      extensions: { '@acme/kit': presetEntry(fixture, '@acme/kit') },
    }), fixture.timers.time.value);
    fixture.runtime.registry.refresh();
    const homeProblem = problemOf(await updatePreset(fixture, workspaceA, { app: { home: '/nowhere' } }, 1));
    expect(homeProblem.code).toBe('PRESET_REFERENCE_MISSING');
    expect(homeProblem.issues?.[0]).toMatchObject({ path: 'app.home', message: 'no active page opens on /nowhere' });
    expect(readAppliedPreset({ connection: fixture.connection }, workspaceA)?.revision).toBe(1);
    expect(await updatePreset(fixture, workspaceA, { hidden: ['nope.z'] }, 1)).toEqual({ ok: true, value: { revision: 2 } });
  });

  it('M2.10-E36 validating a page reports a clash, accepts the card, and refuses the private composite', async () => {
    const fixture = await openFixture(['kit']);
    writeAppliedPreset(fixture.connection, workspaceA, presetSchema.parse({
      presetVersion: 1, id: 'kit-app', name: 'Kit App', revision: 1,
      app: { title: 'Kit App', home: '/kit' },
      extensions: { '@acme/kit': presetEntry(fixture, '@acme/kit') },
    }), fixture.timers.time.value);
    fixture.runtime.registry.refresh();
    expect(await validatedPage(fixture, jsonSchema.parse({
      description: 'Clash.', route: '/kit', title: 'Clash', view: { type: 'text', text: 'Clash.' },
    }))).toEqual({
      ok: false,
      issues: [{
        path: 'route',
        message: 'kit.home (/kit) and the page (/kit) open on the same route',
      }],
    });
    expect(await validatedPage(fixture, jsonSchema.parse({
      description: 'Card.', route: '/fine', title: 'Card',
      queries: { items: { query: 'kit.items.list' } },
      view: { type: 'kit.card', title: 'Hi', children: [{ type: 'text', text: '$query.items.items.0.name' }] },
    }))).toEqual({ ok: true, issues: [] });
    expect(await validatedPage(fixture, jsonSchema.parse({
      description: 'Secret.', route: '/secret', title: 'Secret', view: { type: 'kit.secret', title: 'Hi' },
    }))).toEqual({
      ok: false,
      issues: [{ path: 'view.type', message: 'kit.secret is private to @acme/kit' }],
    });
  });
});
