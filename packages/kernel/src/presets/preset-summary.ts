import { platformNamespaces, type HiddenSummary, type Preset, type PresetSummary } from '@kvman/protocol';

// 07 §7.4, ADR 0147: what the import preview hides, grouped by platform pack.
export function hiddenSummary(hidden: readonly string[] | undefined): HiddenSummary {
  const platform: string[] = [];
  let others = 0;
  for (const id of hidden ?? []) {
    const namespace = id.slice(0, id.indexOf('.'));
    if (platformNamespaces.some((candidate) => candidate === namespace)) platform.push(id);
    else others += 1;
  }
  return { platform, others };
}

// 07 §7.4, ADR 0147: the import preview summary, the workspace-independent part of the apply preview.
export function presetSummary(preset: Preset, replaces: { id: string; name: string } | null): PresetSummary {
  const extensions = Object.entries(preset.extensions)
    .map(([name, entry]) => ({ name, source: entry.source, enabled: entry.enabled, grants: entry.grants }))
    .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
  return {
    preset: {
      id: preset.id,
      name: preset.name,
      ...(preset.description === undefined ? {} : { description: preset.description }),
      revision: preset.revision,
    },
    replaces,
    extensions,
    pages: (preset.pages ?? []).map((page) => `preset.${page.name}`),
    config: Object.keys(preset.config ?? {}).sort(),
    hidden: hiddenSummary(preset.hidden),
  };
}
