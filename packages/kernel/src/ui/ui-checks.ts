import type { Issue, JsonObject, Manifest, Preset } from '@kvman/protocol';
import type { ValueChecker } from './value-checks.ts';
import { bindingIssues } from './binding-rules.ts';
import { authorityIssues, compositeGraph, componentUseIssues, graphIssues, requireComponentIssues } from './component-rules.ts';
import { navItemIssues, placementIssues, slotNodeIssues } from './placement-rules.ts';
import { presetPages, presetReferenceIssues, presetWarnings } from './preset-ui-rules.ts';
import { manifestPages, routeClashIssues, routeFormIssues, type ActivePage } from './route-rules.ts';
import { targetIssues } from './target-rules.ts';
import { presetPageSites, uiSites, type UiSite } from './ui-sites.ts';
import { UiWorld } from './ui-world.ts';
import { dialogsInside, entityRouteIssues, viewRuleIssues } from './view-rules.ts';
import type { ViewAuthor } from './view-targets.ts';

// ADR 0157: the code of a failed UI check is the first category found, in this order.
export type UiCode = 'EXT_REQUIRES_MISSING' | 'ROUTE_CONFLICT' | 'PRESET_REFERENCE_MISSING' | 'VALIDATION_FAILED';
const codeOrder: readonly UiCode[] = ['EXT_REQUIRES_MISSING', 'ROUTE_CONFLICT', 'PRESET_REFERENCE_MISSING', 'VALIDATION_FAILED'];

export type UiCheck = { issues: Issue[]; code: UiCode | undefined };

type Found = { code: UiCode; issues: Issue[] };

function prefixed(prefix: string, issues: readonly Issue[]): Issue[] {
  return issues.map((issue) => ({ ...issue, path: issue.path === '' ? prefix.slice(0, -1) : `${prefix}${issue.path}` }));
}

function siteIssues(site: UiSite, world: UiWorld, author: ViewAuthor, values: ValueChecker | undefined, inside: (component: string) => number): Issue[] {
  const manifest = author.kind === 'extension' ? author.manifest : undefined;
  return [
    ...(manifest === undefined ? [] : placementIssues(site, world, manifest)),
    ...slotNodeIssues(site, world, manifest, values),
    ...componentUseIssues(site, world, author, values),
    ...authorityIssues(site),
    ...targetIssues(site, world, author, values),
    ...bindingIssues(site, world, manifest),
    ...viewRuleIssues(site, world, manifest, inside),
  ];
}

function componentSites(sites: readonly UiSite[]): Map<string, UiSite> {
  return new Map(sites.filter((site) => site.kind === 'component').map((site) => [site.id, site]));
}

function manifestIssues(manifest: Manifest, world: UiWorld, values: ValueChecker | undefined, inside: (component: string) => number): Issue[] {
  const author: ViewAuthor = { kind: 'extension', manifest };
  return [
    ...uiSites(manifest).flatMap((site) => siteIssues(site, world, author, values, inside)),
    ...navItemIssues(manifest),
    ...entityRouteIssues(manifest),
    ...routeFormIssues(manifestPages(manifest)),
  ];
}

// The UI rules that read only one manifest (ADR 0157), for recording and `kernel.validate { manifest }`: another
// extension's slots, entities, targets, components, and types wait for the workspace.
export function manifestUiIssues(manifest: Manifest, values: ValueChecker | undefined): Issue[] {
  const world = new UiWorld([manifest], false);
  const sites = uiSites(manifest);
  const pathOf = (component: string): string => sites.find((site) => site.id === component)?.path ?? '';
  return [
    ...manifestIssues(manifest, world, values, dialogsInside(componentSites(sites))),
    ...graphIssues(compositeGraph(sites), pathOf),
    ...routeClashIssues(manifestPages(manifest)),
  ];
}

export type WorkspaceUiInput = {
  enabled: readonly Manifest[];
  installed: readonly Manifest[];
  preset: Preset | undefined;
  // The preset's own references and pages are checked where the preset is written (apply stage, apply, update) and
  // validated; an enable or reload checks the extensions, with the preset's pages only as active routes (ADR 0157).
  presetChecks: boolean;
  values: ValueChecker | undefined;
};

function chosen(found: readonly Found[]): UiCheck {
  const issues = found.flatMap((entry) => entry.issues);
  const failed = codeOrder.find((code) => found.some((entry) => entry.code === code && entry.issues.some((issue) => issue.severity !== 'warning')));
  return { issues, code: failed };
}

// The UI rules against a workspace's enabled set and preset (ADR 0157): every enabled manifest's UI with its
// foreign references resolved, requireComponents, composite cycles and depth across extensions, routes of every
// active page, and the preset's references and pages. Issues are at `extensions.<name>.…` or the preset's paths.
export function workspaceUiCheck(input: WorkspaceUiInput): UiCheck {
  const world = new UiWorld(input.enabled, true, input.installed);
  const owned = input.enabled.map((manifest) => ({ manifest, prefix: `extensions.${manifest.meta.name}.`, sites: uiSites(manifest) }));
  const allSites = owned.flatMap((entry) => entry.sites);
  const inside = dialogsInside(componentSites(allSites));
  const preset = input.preset === undefined ? undefined : presetPages(input.preset);
  const pages: ActivePage[] = [...owned.flatMap((entry) => manifestPages(entry.manifest, entry.prefix)), ...(preset?.pages ?? [])];
  const pathOf = (component: string): string => {
    const owner = owned.find((entry) => entry.sites.some((site) => site.id === component));
    const site = owner?.sites.find((candidate) => candidate.id === component);
    return owner === undefined || site === undefined ? '' : `${owner.prefix}${site.path}`;
  };
  const presetIssues = !input.presetChecks || preset === undefined ? [] : [
    ...presetPageSites(preset.entries).flatMap((site) => siteIssues(site, world, { kind: 'preset' }, input.values, inside)),
    ...routeFormIssues(preset.pages),
  ];
  return chosen([
    { code: 'EXT_REQUIRES_MISSING', issues: owned.flatMap(({ manifest, prefix }) => prefixed(prefix, requireComponentIssues(manifest, world))) },
    { code: 'ROUTE_CONFLICT', issues: routeClashIssues(pages) },
    { code: 'PRESET_REFERENCE_MISSING', issues: !input.presetChecks || input.preset === undefined ? [] : presetReferenceIssues(input.preset, pages) },
    { code: 'VALIDATION_FAILED', issues: [
      ...owned.flatMap(({ manifest, prefix }) => prefixed(prefix, manifestIssues(manifest, world, input.values, inside))),
      ...graphIssues(compositeGraph(allSites), pathOf),
      ...presetIssues,
      ...(!input.presetChecks || input.preset === undefined ? [] : presetWarnings(input.preset, input.enabled)),
    ] },
  ]);
}

// ADR 0157: `kernel.validate { workspaceId, page }` checks the page as one of the workspace preset's pages: its views
// against the enabled set, and its route against the active pages. Paths are relative to the page.
export function pageUiIssues(input: WorkspaceUiInput, page: JsonObject): Issue[] {
  const world = new UiWorld(input.enabled, true, input.installed);
  const sites = input.enabled.flatMap((manifest) => uiSites(manifest));
  const inside = dialogsInside(componentSites(sites));
  const [site] = presetPageSites([page]);
  const own = site === undefined ? [] : siteIssues(site, world, { kind: 'preset' }, input.values, inside);
  const active = [
    ...input.enabled.flatMap((manifest) => manifestPages(manifest, `extensions.${manifest.meta.name}.`)),
    ...(input.preset === undefined ? [] : presetPages(input.preset).pages),
  ];
  const route = routeClashIssues([...active, { id: 'the page', route: typeof page['route'] === 'string' ? page['route'] : '', path: 'pages.0.route' }])
    .filter((issue) => issue.path === 'pages.0.route');
  return [...own, ...route].map((issue) => ({ ...issue, path: issue.path.replace(/^pages\.0\.?/, '') }));
}
