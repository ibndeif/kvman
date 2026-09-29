import type { Issue, Json, JsonObject } from '@kvman/protocol';

const placeholders = new Set(['todo', 'tbd', 'fixme', 'xxx', 'description', 'placeholder', '...', '…']);
const nameKeys = ['type', 'name', 'code', 'event', 'prefix', 'id'] as const;
const hint = 'describe in a sentence what it is for';

function isPlaceholder(description: string, owner: string | undefined): boolean {
  const text = description.trim().toLowerCase();
  return placeholders.has(text) || text.startsWith('lorem ipsum') || (owner !== undefined && text === owner.toLowerCase());
}

function nameOf(entry: JsonObject): string | undefined {
  for (const key of nameKeys) {
    const value = entry[key];
    if (typeof value === 'string') return value;
  }
  return undefined;
}

// The registration an entry belongs to is the first array element above it: a type, a collection, an error…
function walk(value: Json, path: string, owner: string | undefined, issues: Issue[]): void {
  if (Array.isArray(value)) {
    value.forEach((element, index) => {
      const entry = element !== null && typeof element === 'object' && !Array.isArray(element) ? element : undefined;
      walk(element, `${path}.${index}`, owner ?? (entry === undefined ? undefined : nameOf(entry)), issues);
    });
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, member] of Object.entries(value)) {
    const at = path === '' ? key : `${path}.${key}`;
    if (key === 'description' && typeof member === 'string') {
      if (isPlaceholder(member, owner)) issues.push({ path: at, message: `the description "${member}" is a placeholder`, hint, code: 'PLACEHOLDER_DESCRIPTION', severity: 'warning' });
      continue;
    }
    walk(member, at, owner, issues);
  }
}

// ADR 0169: a description that is only a placeholder is a warning at its path; catalogs are not descriptions.
export function descriptionIssues(manifest: JsonObject): Issue[] {
  const issues: Issue[] = [];
  for (const [section, value] of Object.entries(manifest)) {
    if (section === 'translations') continue;
    const owner = section === 'meta' && value !== null && typeof value === 'object' && !Array.isArray(value) ? nameOf(value) : undefined;
    walk(value, section, owner, issues);
  }
  return issues;
}
