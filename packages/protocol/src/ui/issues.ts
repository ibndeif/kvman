import type { z } from 'zod';

export function forwardIssues(result: z.ZodSafeParseResult<unknown>, check: z.RefinementCtx, prefix: PropertyKey[] = []): void {
  if (result.success) return;
  for (const issue of result.error.issues) check.addIssue({ code: 'custom', message: issue.message, path: [...prefix, ...issue.path] });
}
