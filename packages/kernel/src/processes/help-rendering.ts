import type { Json, JsonObject, TypeEntry } from '@kvman/protocol';
import { flagOf } from '../kv/flag-names.ts';

export type CallableEntry = Extract<TypeEntry, { kind: 'command' | 'query' }>;

type Field = { name: string; schema: JsonObject; required: boolean };

function objectAt(value: Json | undefined): JsonObject | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined;
}

function fieldsOf(schema: JsonObject | undefined): Field[] {
  const properties = objectAt(schema?.['properties']) ?? {};
  const required = Array.isArray(schema?.['required']) ? schema['required'] : [];
  return Object.entries(properties).flatMap(([name, value]) => {
    const field = objectAt(value);
    return field === undefined ? [] : [{ name, schema: field, required: required.includes(name) }];
  });
}

function typeName(schema: JsonObject): string {
  const { type } = schema;
  if (type === 'array') {
    const items = objectAt(schema['items']);
    return `${items === undefined ? 'value' : typeName(items)}[]`;
  }
  return typeof type === 'string' ? type : 'json';
}

function description(schema: JsonObject): string {
  return typeof schema['description'] === 'string' ? `: ${schema['description']}` : '';
}

function flagLine(field: Field): string {
  const flag = flagOf(field.name);
  const { type } = field.schema;
  const required = field.required ? ' (required)' : '';
  if (type === 'boolean') return `- \`--${flag}\` / \`--no-${flag}\` (boolean)${required}${description(field.schema)}`;
  if (type === 'array') return `- \`--${flag} <${typeName(objectAt(field.schema['items']) ?? {})}>\`, repeated for each item${required}${description(field.schema)}`;
  if (type === 'object') return `- \`--${flag} <json>\` (object as JSON text)${required}${description(field.schema)}`;
  return `- \`--${flag} <${typeName(field.schema)}>\`${required}${description(field.schema)}`;
}

function exampleValue(schema: JsonObject): string {
  const { type } = schema;
  if (type === 'integer') return '1';
  if (type === 'number') return '1.5';
  if (type === 'object') return `'{}'`;
  if (type === 'array') return exampleValue(objectAt(schema['items']) ?? {});
  return 'example';
}

function exampleOf(type: string, fields: readonly Field[]): string {
  const flags = fields.filter((field) => field.required).map((field) => (field.schema['type'] === 'boolean' ? `--${flagOf(field.name)}` : `--${flagOf(field.name)} ${exampleValue(field.schema)}`));
  return ['kv', type, ...flags].join(' ');
}

function outputLines(output: JsonObject | undefined): string[] {
  const fields = fieldsOf(output);
  if (fields.length === 0) return [output === undefined ? 'Nothing: the command answers with no data.' : `JSON of type ${typeName(output)}.`];
  return fields.map((field) => `- \`${field.name}\` (${typeName(field.schema)})${description(field.schema)}`);
}

// 12 §12.6, ADR 0141: `kv help <type>` for a model or a person: usage, flags, an example, and the output shape, all
// generated from the registry's schemas.
export function helpMarkdown(entry: CallableEntry): string {
  const fields = fieldsOf(entry.input);
  const usage = ['kv', entry.type, ...fields.map((field) => (field.required ? `--${flagOf(field.name)} <…>` : `[--${flagOf(field.name)} <…>]`))].join(' ');
  return [
    `# \`${entry.type}\` (${entry.kind})`, '', entry.description, '',
    '## Usage', '', `    ${usage}`, '', 'Or pass the whole payload on stdin with `--json -`, or one field with `--<flag>-file -`.', '',
    '## Flags', '', ...(fields.length === 0 ? ['None.'] : fields.map(flagLine)), '',
    '## Example', '', `    ${exampleOf(entry.type, fields)}`, '',
    '## Output', '', ...outputLines(entry.output), '',
    'kv prints `{"ok":true,"data":…}` on stdout, or `{"ok":false,"problem":…}` on stderr with exit code 1.',
  ].join('\n');
}
