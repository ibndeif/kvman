import { jsonSchema, type Issue, type JsonObject, type Manifest, type Preset } from '@kvman/protocol';
import { keyUses } from './key-uses.ts';
import { textIssues } from './text-rules.ts';

// ADR 0160: an extension's key uses are anywhere in its manifest except its catalogs.
export function manifestTextIssues(candidate: JsonObject, manifest: Manifest): Issue[] {
  const uses = Object.entries(candidate).filter(([key]) => key !== 'translations').flatMap(([key, value]) => keyUses(value, key));
  return textIssues(manifest.translations, uses, { subject: 'the extension', register: 'register catalogs with ext.registerTranslations' });
}

const presetText = ['app', 'labels', 'pages', 'navGroups', 'nav'] as const;

// ADR 0160: a preset's key uses are in its app, labels, pages, nav groups, and nav, looked up in its own catalogs;
// a preset gets no literal-text warning.
export function presetTextIssues(preset: Preset): Issue[] {
  const uses = presetText.flatMap((key) => (preset[key] === undefined ? [] : keyUses(jsonSchema.parse(preset[key]), key)));
  return textIssues(preset.translations ?? null, uses, { subject: 'the preset', register: 'add the key to the preset\'s translations' });
}
