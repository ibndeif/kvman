import {
  actionDefSchema, isBindingText, manifestSchema, navGroupDefSchema, navItemDefSchema, pageDefSchema, panelDefSchema, rendererDefSchema,
  statusItemDefSchema, toolbarItemDefSchema, type Issue, type JsonObject, type Manifest,
} from '@kvman/protocol';
import { jsonDocument } from '../registry/kernel-json-schemas.ts';
import { builtinComponentEntries } from '../registry/schema-components.ts';
import { uiSites } from '../ui/ui-sites.ts';
import { uiEntries, type UiKind } from '../ui/ui-world.ts';
import { objectOf, stringAt } from '../validation/json-reading.ts';
import { textsIn } from './text-positions.ts';

const manifestDocument = jsonDocument(manifestSchema, 'input');
// The manifest schema checks UI entries through a refinement, so each entry is walked with its own shape.
const contributionDocuments: ReadonlyArray<readonly [UiKind, JsonObject]> = [
  ['pages', jsonDocument(pageDefSchema, 'input')], ['navGroups', jsonDocument(navGroupDefSchema, 'input')],
  ['navItems', jsonDocument(navItemDefSchema, 'input')], ['toolbarItems', jsonDocument(toolbarItemDefSchema, 'input')],
  ['statusItems', jsonDocument(statusItemDefSchema, 'input')], ['panels', jsonDocument(panelDefSchema, 'input')],
  ['actions', jsonDocument(actionDefSchema, 'input')], ['renderers', jsonDocument(rendererDefSchema, 'input')],
];
const builtinProps = new Map(builtinComponentEntries().map((entry) => [entry.name, entry.props]));
const interpolation = /\{\{[^{}]*\}\}/g;
const formKeys = ['label', 'help'] as const;

// ADR 0160: a literal is text that is neither a binding nor a key, and that still has a letter once its `{{ }}`
// parts are removed.
function isLiteral(text: string): boolean {
  return !isBindingText(text) && /\p{L}/u.test(text.replace(interpolation, ''));
}

// Schema `.meta` labels, help, and `ui.group` of the schemas that become forms: the config and command inputs.
function formTexts(schema: JsonObject | undefined, path: string, found: Map<string, string>): void {
  if (schema === undefined) return;
  for (const key of formKeys) {
    const text = schema[key];
    if (typeof text === 'string') found.set(`${path}.${key}`, text);
  }
  const group = stringAt(objectOf(schema['ui']), 'group');
  if (group !== undefined) found.set(`${path}.ui.group`, group);
  for (const [name, member] of Object.entries(objectOf(schema['properties']) ?? {})) formTexts(objectOf(member), `${path}.properties.${name}`, found);
  for (const keyword of ['items', 'additionalProperties']) formTexts(objectOf(schema[keyword]), `${path}.${keyword}`, found);
  for (const keyword of ['anyOf', 'oneOf', 'allOf']) {
    const branches = schema[keyword];
    if (Array.isArray(branches)) branches.forEach((branch, index) => formTexts(objectOf(branch), `${path}.${keyword}.${index}`, found));
  }
  for (const [name, definition] of Object.entries(objectOf(schema['$defs']) ?? {})) formTexts(objectOf(definition), `${path}.$defs.${name}`, found);
}

// View nodes: built-in props as their spec marks them, and the extension's own composites and widgets as their
// recorded props mark them.
function viewTexts(manifest: Manifest, found: Map<string, string>): void {
  const ownProps = new Map(uiEntries(manifest, 'components').map((entry) => [stringAt(entry, 'id') ?? '', objectOf(entry['props'])]));
  for (const site of uiSites(manifest)) {
    for (const fact of site.facts) {
      if (fact.kind !== 'node') continue;
      const props = builtinProps.get(fact.type) ?? ownProps.get(fact.type);
      if (props !== undefined) textsIn(fact.node, props, fact.path, found);
    }
  }
}

// 06 §6.3, ADR 0160: a literal user-facing `Text` is a warning for an installed extension.
export function literalIssues(candidate: JsonObject, manifest: Manifest): Issue[] {
  const found = textsIn(candidate, manifestDocument, '');
  for (const [kind, document] of contributionDocuments) {
    uiEntries(manifest, kind).forEach((entry, index) => textsIn(entry, document, `ui.${kind}.${index}`, found));
  }
  formTexts(objectOf(objectOf(candidate['config'])?.['schema']), 'config.schema', found);
  manifest.types.forEach((entry, index) => {
    if (entry.kind === 'command') formTexts(entry.input, `types.${index}.input`, found);
  });
  viewTexts(manifest, found);
  return [...found].filter(([, text]) => isLiteral(text)).map(([path, text]): Issue => ({
    path, message: `the text "${text.length > 40 ? `${text.slice(0, 40)}…` : text}" is literal, so it is never translated`,
    hint: 'write a key of the catalog, such as "$t.files.title"', severity: 'warning',
  }));
}
