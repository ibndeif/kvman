import { describe, expect, it } from 'vitest';
import { builtinComponentSpecs, toJsonSchemaDocument, type Json } from '../src/index.ts';

function textPaths(document: Json, path: string, found: string[]): void {
  if (Array.isArray(document)) {
    document.forEach((entry, index) => textPaths(entry, `${path}.${index}`, found));
    return;
  }
  if (document !== null && typeof document === 'object') {
    if (document['format'] === 'kvman-text') found.push(path);
    for (const [key, value] of Object.entries(document)) textPaths(value, path === '' ? key : `${path}.${key}`, found);
  }
}

function markedPaths(component: string): string[] {
  const spec = builtinComponentSpecs.find((candidate) => candidate.name === component);
  if (spec === undefined) throw new Error(`no built-in component ${component}`);
  const converted = toJsonSchemaDocument(spec.props, 'input');
  if (!converted.ok) throw new Error(`${component} does not convert: ${converted.message}`);
  const found: string[] = [];
  textPaths(converted.document, '', found);
  return found.sort();
}

// Every Action of 08 §8.7 carries the same nested Text fields: the form overrides, the confirm dialog, the busy
// label, the toast effects, and the dialog title.
function actionTextPaths(root: string): string[] {
  const form = `${root}.anyOf.0.properties.form.anyOf.1.properties`;
  return [
    `${form}.title`,
    `${form}.submitLabel`,
    `${form}.fields.additionalProperties.properties.label`,
    `${form}.fields.additionalProperties.properties.help`,
    `${form}.fields.additionalProperties.properties.placeholder`,
    `${form}.fields.additionalProperties.properties.group`,
    `${form}.fields.additionalProperties.properties.options.items.prefixItems.1`,
    `${root}.anyOf.0.properties.confirm.properties.title`,
    `${root}.anyOf.0.properties.confirm.properties.body`,
    `${root}.anyOf.0.properties.busyLabel`,
    `${root}.anyOf.0.properties.then.items.anyOf.0.properties.toast`,
    `${root}.anyOf.2.properties.openDialog.properties.title`,
  ];
}

// Every Text prop and nested Text field of 08 §8.8, as JSON paths of the converted props schema.
const expected: Record<string, string[]> = {
  page: ['properties.title', 'properties.subtitle'],
  stack: [],
  row: [],
  grid: [],
  split: [],
  section: ['properties.title', 'properties.description'],
  card: ['properties.title', 'properties.subtitle', ...actionTextPaths('properties.onClick')],
  tabs: [...actionTextPaths('properties.onChange')],
  tab: ['properties.label'],
  divider: [],
  slot: [],
  children: [],
  text: ['properties.text'],
  heading: ['properties.text'],
  markdown: ['properties.source'],
  badge: ['properties.text'],
  stat: ['properties.label', 'properties.hint'],
  keyValue: ['properties.items.items.properties.label'],
  progress: ['properties.label'],
  code: [],
  diff: [],
  json: [],
  image: ['properties.alt'],
  notice: ['properties.title', 'properties.body', 'properties.action.properties.label', ...actionTextPaths('properties.action.properties.action')],
  emptyState: ['properties.title', 'properties.body', 'properties.action.properties.label', ...actionTextPaths('properties.action.properties.action')],
  liveText: ['properties.initial'],
  fileLink: ['properties.name', ...actionTextPaths('properties.onClick')],
  table: [
    'properties.columns.items.properties.label',
    'properties.emptyState.properties.title',
    'properties.emptyState.properties.body',
    ...actionTextPaths('properties.onRowClick'),
    ...actionTextPaths('properties.onSelect'),
  ],
  list: [
    'properties.emptyState.properties.title',
    'properties.emptyState.properties.body',
    ...actionTextPaths('properties.onItemClick'),
  ],
  thread: ['properties.emptyState.properties.title', 'properties.emptyState.properties.body'],
  settingsSections: [],
  form: [
    'properties.title',
    'properties.submitLabel',
    'properties.fields.additionalProperties.properties.label',
    'properties.fields.additionalProperties.properties.help',
    'properties.fields.additionalProperties.properties.placeholder',
    'properties.fields.additionalProperties.properties.group',
    'properties.fields.additionalProperties.properties.options.items.prefixItems.1',
    'properties.then.items.anyOf.0.properties.toast',
  ],
  textInput: ['properties.label', 'properties.help', 'properties.placeholder', ...actionTextPaths('properties.onChange')],
  textArea: ['properties.label', 'properties.help', 'properties.placeholder', ...actionTextPaths('properties.onChange')],
  numberInput: ['properties.label', 'properties.help', ...actionTextPaths('properties.onChange')],
  select: [
    'properties.label',
    'properties.help',
    'properties.options.anyOf.0.items.prefixItems.1',
    'properties.placeholder',
    ...actionTextPaths('properties.onChange'),
  ],
  checkbox: ['properties.label', 'properties.help', ...actionTextPaths('properties.onChange')],
  switch: ['properties.label', 'properties.help', ...actionTextPaths('properties.onChange')],
  dateInput: ['properties.label', 'properties.help', ...actionTextPaths('properties.onChange')],
  upload: ['properties.label', 'properties.help', ...actionTextPaths('properties.onUpload')],
  composer: ['properties.label', 'properties.help', 'properties.placeholder', ...actionTextPaths('properties.onSubmit')],
  button: ['properties.label', 'properties.busyLabel', ...actionTextPaths('properties.onClick')],
  actionGroup: [],
  menu: ['properties.label'],
  menuItem: ['properties.label', ...actionTextPaths('properties.onClick')],
};

describe('built-in Text props carry format kvman-text (plan 08 §8.8)', () => {
  it('M2.11-E48 every Text prop of 08 §8.8 is marked, and nothing else is', () => {
    expect(builtinComponentSpecs.map((spec) => spec.name).sort()).toEqual(Object.keys(expected).sort());
    for (const spec of builtinComponentSpecs) {
      expect(markedPaths(spec.name), spec.name).toEqual([...(expected[spec.name] ?? [])].sort());
    }
  });
});
