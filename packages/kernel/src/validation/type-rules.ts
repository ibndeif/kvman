import { checkTypeName, type Issue, type Json, type JsonObject, type TypeKind } from '@kvman/protocol';
import { arrayAt, has, objectOf, stringAt } from './json-reading.ts';
import { laneIssues } from './lane-rules.ts';

const typeKinds: readonly string[] = ['command', 'query', 'event'];

function isTypeKind(kind: string | undefined): kind is TypeKind {
  return kind !== undefined && typeKinds.includes(kind);
}

// 02 §2.4, ADRs 0010, 0016, 0108: a format finding is an error; a grammar finding is a warning, or with a naming
// exception a warning `excepted: <reason>`. A name without the namespace prefix is left to that rule.
function grammarIssues(entry: Json, path: string, namespace: string | undefined): Issue[] {
  const name = stringAt(entry, 'type');
  const kind = stringAt(entry, 'kind');
  if (name === undefined || !isTypeKind(kind) || (namespace !== undefined && !name.startsWith(`${namespace}.`))) return [];
  const exception = stringAt(entry, 'namingException');
  return checkTypeName(name, kind).map((finding) => {
    const hint = finding.hint === undefined ? {} : { hint: finding.hint };
    if (finding.rule === 'format') return { path, message: finding.message, ...hint };
    const message = exception === undefined ? finding.message : `excepted: ${exception}`;
    return { path, message, ...hint, severity: 'warning' as const };
  });
}

// 02 §2.4, 06 §6.3: slash commands are typed by people; agent tools are called by the agent.
function accessIssues(entry: Json, path: string): Issue[] {
  const access = stringAt(entry, 'access') ?? 'all';
  const issues: Issue[] = [];
  if (has(entry, 'slash') && access !== 'all' && access !== 'user') {
    issues.push({ path: `${path}.slash`, message: `a slash command has access all or user, not ${access}`, hint: 'set access to all or user, or remove slash' });
  }
  if (has(entry, 'agentTool') && access !== 'all' && access !== 'extensions') {
    issues.push({ path: `${path}.agentTool`, message: `an agent tool has access all or extensions, not ${access}`, hint: 'set access to all or extensions, or remove agentTool' });
  }
  return issues;
}

function eventShapeIssues(entry: Json, path: string): Issue[] {
  if (stringAt(entry, 'delivery') !== 'live' || (has(entry, 'chunk') && !has(entry, 'payload'))) return [];
  return [{ path: `${path}.chunk`, message: 'a live event declares chunk instead of payload', hint: 'declare chunk ("text", "value", or "data") and no payload' }];
}

function commandLaneIssues(entry: Json, path: string): Issue[] {
  const lane = stringAt(entry, 'lane');
  if (lane === undefined || stringAt(entry, 'kind') !== 'command') return [];
  return laneIssues({ path: `${path}.lane`, lane, schema: objectOf(objectOf(entry)?.['input']), describedAs: 'input schema' });
}

// The rules of 02 §2.4 and 06 §6.3 that read one type entry.
export function typeIssues(manifest: JsonObject): Issue[] {
  const namespace = stringAt(manifest['meta'], 'namespace');
  return arrayAt(manifest, 'types').flatMap((entry, index) => {
    const path = `types.${index}`;
    return [
      ...grammarIssues(entry, `${path}.type`, namespace),
      ...accessIssues(entry, path),
      ...eventShapeIssues(entry, path),
      ...commandLaneIssues(entry, path),
    ];
  });
}
