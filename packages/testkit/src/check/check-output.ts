import type { CheckedFinding, Finding } from './finding.ts';

// How `kvman-check` prints its findings (ADR 0009, 116): readable lines for a person, or with `--json` the
// `[{ file?, message, hint }]` array on one line, which kvdev's `ext check` reads.

export function readableFindings(findings: readonly CheckedFinding[]): string {
  if (findings.length === 0) return 'kvman-check: no findings.';
  const lines = findings.map((finding) => `${finding.file ?? 'extension'}: ${finding.message}\n  ${finding.hint}`);
  const errors = findings.filter((finding) => !finding.warning).length;
  return [...lines, `kvman-check: ${String(errors)} error(s), ${String(findings.length - errors)} warning(s).`].join('\n');
}

export function jsonFindings(findings: readonly CheckedFinding[]): string {
  return JSON.stringify(findings.map(({ file, message, hint }): Finding => (file === undefined ? { message, hint } : { file, message, hint })));
}
