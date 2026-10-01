#!/usr/bin/env node
import { checkExtension } from './check/check-extension.ts';
import { jsonFindings, readableFindings } from './check/check-output.ts';

// The `kvman-check` bin (plan 10, ADR 0009, 116): run in an extension project, as its `npm run check`. It exits 1 when
// it finds an error and 0 when it finds only warnings.

const options = process.argv.slice(2);
const unknown = options.filter((option) => option !== '--json');
if (unknown.length > 0) {
  process.stderr.write(`kvman-check: unknown option ${unknown.join(' ')}; the only option is --json.\n`);
  process.exitCode = 1;
} else {
  const findings = await checkExtension(process.cwd());
  process.stdout.write(`${options.includes('--json') ? jsonFindings(findings) : readableFindings(findings)}\n`);
  process.exitCode = findings.some((finding) => !finding.warning) ? 1 : 0;
}
