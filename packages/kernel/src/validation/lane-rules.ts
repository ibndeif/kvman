import { parseLaneTemplate, type Issue, type JsonObject } from '@kvman/protocol';
import { lookupPath } from './schema-paths.ts';

export type LaneSubject = { path: string; lane: string; schema: JsonObject | undefined; describedAs: 'input schema' | 'event payload' };

const syntaxHint = 'write placeholders as {{ $payload.<field> }}, {{ $context.<key> }}, or {{ $message.id }}';

function fieldsHint(fields: readonly string[]): string {
  return fields.length === 0 ? 'no fields are declared there' : `fields there: ${fields.join(', ')}`;
}

// 02 §2.6, 06 §6.3, ADR 0109: a lane template is valid and each `$payload` path exists in the schema it reads.
export function laneIssues({ path, lane, schema, describedAs }: LaneSubject): Issue[] {
  const parse = parseLaneTemplate(lane);
  if (!parse.ok) return [{ path, message: parse.message, hint: syntaxHint }];
  return parse.parts.flatMap((part) => {
    if (!('path' in part) || !part.path.startsWith('$payload.')) return [];
    const segments = part.path.slice('$payload.'.length).split('.');
    const found = schema === undefined ? { found: false as const, fields: [] } : lookupPath(schema, segments);
    if (found.found) return [];
    return [{ path, message: `"${part.path}" is not a field of the ${describedAs}`, hint: fieldsHint(found.fields) }];
  });
}
