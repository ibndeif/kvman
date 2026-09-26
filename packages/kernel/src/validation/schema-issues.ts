import type { Issue, manifestSchema } from '@kvman/protocol';

// A Zod issue as the protocol's schemas report it; the kernel reads it without importing Zod.
export type SchemaIssue = NonNullable<ReturnType<typeof manifestSchema.safeParse>['error']>['issues'][number];

function hintFor(issue: SchemaIssue): string | undefined {
  if (issue.code === 'unrecognized_keys') return `remove ${issue.keys.map((key) => `"${key}"`).join(', ')}`;
  const last = issue.path.at(-1);
  if (last === 'manifestVersion') return 'this kvman reads manifest version 1; upgrade kvman';
  if (last === 'description') return 'add a description in English, for developers and LLMs';
  if (last === 'title' && issue.path[0] === 'errors') return 'add an English title';
  return undefined;
}

// The protocol schema's issues with manifest paths, and a hint where the fix is plain (06 §6.3).
export function schemaIssues(issues: readonly SchemaIssue[]): Issue[] {
  return issues.map((issue) => {
    const hint = hintFor(issue);
    return { path: issue.path.map(String).join('.'), message: issue.message, ...(hint === undefined ? {} : { hint }) };
  });
}
