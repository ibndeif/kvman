import type { Catalog, Issue, Manifest, StageResult, Text } from '@kvman/protocol';

// What a stage produced before it is confirmed (06 §6.2): the tree to install, its file list and digest, and the
// validated manifest.
export type StagedVersion = {
  tree: string;
  source: string;
  integrity?: string;
  digest: string;
  manifest: Manifest;
  warnings: Issue[];
};

type UiEntry = { [field: string]: unknown };

const uiKinds = [
  ['pages', 'page'], ['navGroups', 'navGroup'], ['navItems', 'navItem'], ['toolbarItems', 'toolbarItem'], ['statusItems', 'statusItem'],
  ['panels', 'panel'], ['slots', 'slot'], ['actions', 'action'], ['rendererTargets', 'rendererTarget'], ['renderers', 'renderer'],
  ['components', 'component'],
] as const;

function textField(entry: UiEntry, field: string): string | undefined {
  const value = entry[field];
  return typeof value === 'string' ? value : undefined;
}

// ADR 0118: every UI registration, its kind the register call's noun; `slot` for toolbar items and panels, `target`
// for actions (their entity) and renderers.
function contributionsOf(manifest: Manifest): StageResult['contributions'] {
  const contributions = uiKinds.flatMap(([list, kind]) => manifest.ui[list].map((entry: UiEntry) => {
    const slot = textField(entry, 'slot');
    const target = kind === 'action' ? textField(entry, 'entity') : kind === 'renderer' ? textField(entry, 'target') : undefined;
    return { id: textField(entry, 'id') ?? '', kind, ...(slot === undefined ? {} : { slot }), ...(target === undefined ? {} : { target }) };
  }));
  const settings = manifest.ui.settingsSection === null ? [] : [{ id: `${manifest.meta.namespace}.settings`, kind: 'settingsSection' }];
  return [...contributions, ...settings];
}

function lookup(catalog: Catalog, key: string): string | undefined {
  let current: string | Catalog | undefined = catalog;
  for (const segment of key.split('.')) current = typeof current === 'object' ? current[segment] : undefined;
  return typeof current === 'string' ? current : undefined;
}

// A Text is a key as `"$t.<key>"` or `{ $t: <key> }` (08 §8.16); plain text has no translation.
function translated(catalog: Catalog, text: Text | undefined): string | undefined {
  if (text === undefined) return undefined;
  if (typeof text !== 'string') return lookup(catalog, text.$t);
  return text.startsWith('$t.') ? lookup(catalog, text.slice('$t.'.length)) : undefined;
}

// The staged catalogs' entries for the title, summary, and capability reasons, in every shipped locale (ADR 0015).
function translationsOf(manifest: Manifest): StageResult['translations'] {
  const catalogs = manifest.translations?.catalogs ?? {};
  return Object.fromEntries(Object.entries(catalogs).map(([locale, catalog]) => {
    const title = translated(catalog, manifest.meta.title);
    const summary = translated(catalog, manifest.meta.summary);
    const reasons = Object.fromEntries(manifest.permissions.capabilities.flatMap((capability) => {
      const reason = translated(catalog, capability.reason);
      return reason === undefined ? [] : [[capability.name, reason]];
    }));
    return [locale, { ...(title === undefined ? {} : { title }), ...(summary === undefined ? {} : { summary }), reasons }];
  }));
}

function typesOf(manifest: Manifest): StageResult['types'] {
  return manifest.types.map((entry) => (entry.kind === 'event'
    ? { type: entry.type, kind: entry.kind, agentTool: false }
    : { type: entry.type, kind: entry.kind, access: entry.access, agentTool: entry.agentTool !== undefined }));
}

// The stage reply without its token (06 §6.2, ADR 0015): what the grant dialog shows.
export function stageSummary(staged: StagedVersion): Omit<StageResult, 'confirmationToken' | 'expiresAt'> {
  const { manifest } = staged;
  const { meta, permissions } = manifest;
  return {
    name: meta.name, version: meta.version, title: meta.title, ...(meta.summary === undefined ? {} : { summary: meta.summary }),
    description: meta.description, namespace: meta.namespace, source: staged.source, digest: staged.digest,
    ...(staged.integrity === undefined ? {} : { integrity: staged.integrity }),
    capabilities: {
      requested: permissions.capabilities,
      derived: { subscribes: manifest.subscriptions.map((subscription) => subscription.event), providesLlm: manifest.llm.providers.map((provider) => provider.id) },
    },
    isolation: permissions.isolation, types: typesOf(manifest), contributions: contributionsOf(manifest), warnings: staged.warnings,
    translations: translationsOf(manifest),
  };
}
