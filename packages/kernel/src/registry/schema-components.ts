import { builtinComponentSpecs, jsonSchema, toJsonSchemaDocument, type ComponentSpec, type JsonObject, type SchemaDocument } from '@kvman/protocol';

export type ComponentEntry = SchemaDocument['components'][number];

function jsonSchemaOf(schema: ComponentSpec['props'], what: string): JsonObject {
  const conversion = toJsonSchemaDocument(schema, 'input');
  if (!conversion.ok) throw new Error(`the ${what} of a built-in component does not convert to JSON Schema: ${conversion.message}`);
  return conversion.document;
}

function entryOf(spec: ComponentSpec): ComponentEntry {
  const events = Object.fromEntries(Object.entries(spec.events).map(([name, event]) => [
    name, { description: event.description, ...(event.value === undefined ? {} : { value: jsonSchemaOf(event.value, `${spec.name}.${name} value`) }) },
  ]));
  return {
    name: spec.name, owner: 'shell', form: 'builtin', description: spec.description, props: jsonSchemaOf(spec.props, `${spec.name} props`), events,
    children: typeof spec.children === 'string' ? spec.children : [...spec.children],
    ...(spec.parents === undefined ? {} : { parents: [...spec.parents] }),
    ...(spec.childCount === undefined ? {} : { childCount: spec.childCount }),
    examples: spec.examples.map((example) => jsonSchema.parse(example)), since: spec.since,
  };
}

// ADR 0111: the shell's built-in component specs as `/schema` lists them, props and event values as JSON Schema.
export function builtinComponentEntries(): ComponentEntry[] {
  return builtinComponentSpecs.map(entryOf);
}
