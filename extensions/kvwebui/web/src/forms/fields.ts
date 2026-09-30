import { jsonSchema, z, type Json } from '@kvman/sdk';

// Form fields from a command's input JSON Schema (plan 06 §6.4, ADR 0009, 70). A top-level `anyOf` of objects gives one
// form with every variant's fields, each required only when every variant requires it.

export type FieldKind = 'text' | 'password' | 'number' | 'checkbox' | 'select' | 'lines' | 'group' | 'json';

export type Field = {
  name: string;
  // The field's path from the input's top, joined with dots: `meta.author`.
  path: string;
  kind: FieldKind;
  required: boolean;
  nullable: boolean;
  description?: string;
  options?: Json[];
  // For `lines`: whether each line is a number.
  numbers?: boolean;
  children?: Field[];
};

type SchemaNode = {
  type?: string | string[] | undefined;
  enum?: Json[] | undefined;
  properties?: Record<string, SchemaNode> | undefined;
  required?: string[] | undefined;
  items?: SchemaNode | undefined;
  anyOf?: SchemaNode[] | undefined;
  description?: string | undefined;
  writeOnly?: boolean | undefined;
};

const schemaNode: z.ZodType<SchemaNode> = z.lazy(() =>
  z.looseObject({
    type: z.union([z.string(), z.array(z.string())]).optional(),
    enum: z.array(jsonSchema).optional(),
    properties: z.record(z.string(), schemaNode).optional(),
    required: z.array(z.string()).optional(),
    items: schemaNode.optional(),
    anyOf: z.array(schemaNode).optional(),
    description: z.string().optional(),
    writeOnly: z.boolean().optional(),
  }),
);

const isNull = (node: SchemaNode): boolean => node.type === 'null';

// A node without its `null` alternative, and whether it had one.
function withoutNull(node: SchemaNode): { node: SchemaNode; nullable: boolean } {
  if (node.anyOf !== undefined && node.anyOf.some(isNull)) {
    const rest = node.anyOf.filter((alternative) => !isNull(alternative));
    const only = rest.length === 1 ? rest[0] : undefined;
    return { node: { ...(only ?? { anyOf: rest }), description: node.description ?? only?.description }, nullable: true };
  }
  if (Array.isArray(node.type) && node.type.includes('null')) {
    const types = node.type.filter((type) => type !== 'null');
    return { node: { ...node, type: types.length === 1 ? types[0] : types }, nullable: true };
  }
  return { node, nullable: false };
}

function kindOf(node: SchemaNode): Pick<Field, 'kind' | 'options' | 'numbers'> {
  if (node.enum !== undefined) return { kind: 'select', options: node.enum };
  switch (node.type) {
    case 'string':
      return { kind: node.writeOnly === true ? 'password' : 'text' };
    case 'number':
    case 'integer':
      return { kind: 'number' };
    case 'boolean':
      return { kind: 'checkbox' };
    case 'array':
      if (node.items?.enum === undefined && (node.items?.type === 'string' || node.items?.type === 'number' || node.items?.type === 'integer')) {
        return { kind: 'lines', numbers: node.items.type !== 'string' };
      }
      return { kind: 'json' };
    case 'object':
      return { kind: node.properties === undefined ? 'json' : 'group' };
    default:
      return { kind: 'json' };
  }
}

function fieldOf(name: string, path: string, raw: SchemaNode, required: boolean): Field {
  const { node, nullable } = withoutNull(raw);
  const kind = kindOf(node);
  const field: Field = { name, path, required, nullable, ...kind };
  if (node.description !== undefined) field.description = node.description;
  if (kind.kind === 'group') field.children = objectFields(node, path);
  return field;
}

function objectFields(node: SchemaNode, prefix: string): Field[] {
  const required = new Set(node.required ?? []);
  return Object.entries(node.properties ?? {}).map(([name, child]) => fieldOf(name, prefix === '' ? name : `${prefix}.${name}`, child, required.has(name)));
}

// The object variants of a top-level `anyOf`, merged into one object node.
function mergedVariants(variants: readonly SchemaNode[]): SchemaNode {
  const properties: Record<string, SchemaNode> = {};
  for (const variant of variants) Object.assign(properties, variant.properties ?? {});
  const required = Object.keys(properties).filter((name) => variants.every((variant) => variant.required?.includes(name) === true));
  return { type: 'object', properties, required };
}

/** The fields of an object input schema, without the `fixed` ones. */
export function inputFields(schema: unknown, fixed: readonly string[]): Field[] {
  const node = schemaNode.parse(schema);
  const root = node.anyOf !== undefined && node.anyOf.every((variant) => variant.type === 'object') ? mergedVariants(node.anyOf) : node;
  return objectFields(root, '').filter((field) => !fixed.includes(field.name));
}

/** The one field of a setting's value. */
export function valueField(schema: unknown): Field {
  return fieldOf('value', 'value', schemaNode.parse(schema), true);
}
