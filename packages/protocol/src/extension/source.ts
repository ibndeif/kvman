import { z } from 'zod';

const packageName = '(?:@[a-z0-9][a-z0-9._~-]*\\/)?[a-z0-9][a-z0-9._~-]*';
const exactVersion = '\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?';
const commit = '[0-9a-f]{40}';

export type SourceKind = 'npm' | 'git' | 'builtin' | 'dev' | 'local';

const sourceForms: ReadonlyArray<{ kind: SourceKind; pattern: RegExp; rule: string }> = [
  { kind: 'npm', pattern: new RegExp(`^npm:${packageName}@${exactVersion}$`), rule: 'npm sources name an exact version, e.g. npm:@acme/pdf@1.4.2' },
  { kind: 'git', pattern: new RegExp(`^git:(?:https|ssh|git)://[^\\s#]+#${commit}$`), rule: 'git sources use https, ssh, or git and a 40-character commit, e.g. git:https://host/repo.git#<commit>' },
  { kind: 'builtin', pattern: new RegExp(`^builtin:${packageName}$`), rule: 'builtin sources name a package, e.g. builtin:@kvman/agent' },
  { kind: 'dev', pattern: /^dev:[a-z0-9][a-z0-9._-]*@[1-9][0-9]*$/, rule: 'dev sources are dev:<name>@<n>, the name without "@", n from 1' },
  { kind: 'local', pattern: /^local:[0-9a-f]{64}$/, rule: 'local sources are local:<sha256 digest>' },
];

const integrityPatterns: Record<SourceKind, RegExp | undefined> = {
  npm: /^sha512-[A-Za-z0-9+/]+={0,2}$/,
  git: new RegExp(`^git:${commit}$`),
  builtin: new RegExp(`^builtin:${exactVersion}$`),
  dev: undefined,
  local: undefined,
};

export function sourceKindOf(source: string): SourceKind | 'unknown' {
  const prefix = source.slice(0, source.indexOf(':'));
  return sourceForms.find((form) => form.kind === prefix)?.kind ?? 'unknown';
}

export const sourceSchema = z.string().superRefine((source, check) => {
  const kind = sourceKindOf(source);
  const form = sourceForms.find((candidate) => candidate.kind === kind);
  if (form === undefined) {
    check.addIssue({ code: 'custom', message: 'a source starts with npm:, git:, builtin:, dev:, or local:' });
  } else if (!form.pattern.test(source)) {
    check.addIssue({ code: 'custom', message: form.rule });
  }
});

export function integrityProblem(source: string, integrity: string | undefined): string | undefined {
  const kind = sourceKindOf(source);
  if (kind === 'unknown') return undefined;
  const pattern = integrityPatterns[kind];
  if (pattern === undefined) {
    return integrity === undefined ? undefined : `${kind}: sources have no integrity`;
  }
  if (integrity === undefined) return `${kind}: sources need an integrity`;
  return pattern.test(integrity) ? undefined : `the integrity does not fit a ${kind}: source`;
}
