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

// A union fails where it stands; when exactly one branch failed below its own root (the value had that branch's
// type, as a nested catalog does), that branch's issues say what is wrong, at their deeper paths.
// When every branch refused only the value's type, the issue names the types the union takes.
function unionIssues(issue: SchemaIssue): readonly SchemaIssue[] {
  if (issue.code !== 'invalid_union') return [issue];
  const deeper = issue.errors.filter((branch) => branch.length > 0 && branch.every((inner) => inner.path.length > 0));
  const [branch] = deeper;
  if (deeper.length === 1 && branch !== undefined) return branch.flatMap((inner) => unionIssues({ ...inner, path: [...issue.path, ...inner.path] }));
  const expected = issue.errors.flatMap((errors) => (errors.length === 1 && errors[0]?.code === 'invalid_type' ? [errors[0].expected] : []));
  if (expected.length !== issue.errors.length) return [issue];
  return [{ ...issue, message: `Invalid input: expected ${expected.join(' or ')}` }];
}

// The protocol schema's issues with manifest paths, and a hint where the fix is plain (06 §6.3).
export function schemaIssues(issues: readonly SchemaIssue[]): Issue[] {
  return issues.flatMap(unionIssues).map((issue) => {
    const hint = hintFor(issue);
    return { path: issue.path.map(String).join('.'), message: issue.message, ...(hint === undefined ? {} : { hint }) };
  });
}
