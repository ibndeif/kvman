const arrayIndexPattern = /^(?:0|[1-9][0-9]*)$/;
const plainLabelPattern = /^[A-Za-z_][A-Za-z0-9_-]*$/;

export class UnsupportedFieldName extends Error {
  constructor(field: string) {
    super(`the field name ${JSON.stringify(field)} contains '"', which stored paths cannot address`);
    this.name = 'UnsupportedFieldName';
  }
}

export function sqlLiteral(text: string): string {
  return `'${text.replaceAll("'", "''")}'`;
}

function label(segment: string): string {
  if (segment.includes('"')) throw new UnsupportedFieldName(segment);
  return plainLabelPattern.test(segment) ? segment : `"${segment}"`;
}

// A numeric segment addresses an array element when the value there is an array, and an object key otherwise
// (the protocol evaluator's rule), so the path is chosen at run time.
function pathFrom(prefix: string, remaining: readonly string[]): string {
  const [segment, ...rest] = remaining;
  if (segment === undefined) return sqlLiteral(prefix);
  if (!arrayIndexPattern.test(segment)) return pathFrom(`${prefix}.${label(segment)}`, rest);
  return `CASE WHEN json_type(data, ${sqlLiteral(prefix)}) = 'array' THEN ${pathFrom(`${prefix}[${segment}]`, rest)} ELSE ${pathFrom(`${prefix}."${segment}"`, rest)} END`;
}

export type FieldExpressions = { type: string; value: string; path: string };

export function fieldExpressions(field: string): FieldExpressions {
  const path = pathFrom('$', field.split('.'));
  return { type: `json_type(data, ${path})`, value: `json_extract(data, ${path})`, path };
}
