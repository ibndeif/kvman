import type { Problem } from '@kvman/sdk';

// A Problem's translated text is `<namespace>.errors.<CODE>`, where the kernel's namespace is `kernel` (plan 05).

export function problemKey(problem: Problem): string {
  const slash = problem.code.indexOf('/');
  return slash < 0 ? `kernel.errors.${problem.code}` : `${problem.code.slice(0, slash)}.errors.${problem.code.slice(slash + 1)}`;
}

// The params a Problem's text is filled with, as strings.
export function problemParams(problem: Problem): Record<string, string> {
  return Object.fromEntries(Object.entries(problem.params ?? {}).map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)]));
}

// The fields a VALIDATION_FAILED Problem names: the first segment of each issue path.
export function invalidFields(problem: Problem): string[] {
  const issues = problem.params?.['issues'];
  if (!Array.isArray(issues)) return [];
  return issues.flatMap((issue) => {
    if (typeof issue !== 'object' || issue === null || Array.isArray(issue)) return [];
    const path = issue['path'];
    return typeof path === 'string' && path !== '' ? [path.split('.')[0] ?? path] : [];
  });
}
