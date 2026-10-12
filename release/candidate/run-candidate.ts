// Candidate execution (KVC34, ADR 0047): each gate runs once, serially, and the first
// nonzero exit, spawn error, signal, missing file, or name mismatch stops the candidate.
// No retries, no timeout changes, no benchmark threshold changes. Injectable runners and
// readers keep Vitest coverage lightweight without nested repository gates.

import type { PackageEmission } from './candidate-plan.ts';
import { packageEmissions } from './candidate-plan.ts';

/** Outcome of one `pnpm run <script>` subprocess. */
export type ScriptResult = {
  readonly status: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly output: string;
  readonly error?: Error;
};

/** Runs one repository script once and returns its subprocess outcome. */
export type ScriptRunner = (script: string) => ScriptResult;

/** Reads package manifests and checks emitted files without running a build. */
export type EmissionReader = {
  readPackageJson: (folder: string) => string;
  emissionExists: (folder: string, entry: string, kind: 'js' | 'd.ts') => boolean;
};

/** Status of one attempted gate for host-identifying output. */
export type GateReport = {
  readonly gate: string;
  readonly ok: boolean;
  readonly detail: string;
};

/** Candidate result: only attempted gates are listed, in execution order. */
export type CandidateReport = {
  readonly host: string;
  readonly gates: readonly GateReport[];
  readonly ok: boolean;
};

/** Candidate input: host label plus injectable script and emission adapters. */
export type CandidateInput = {
  readonly host: string;
  readonly runScript: ScriptRunner;
  readonly reader: EmissionReader;
};

/** Failure message for a script outcome, or undefined when it passed. */
export function describeScriptFailure(script: string, result: ScriptResult): string | undefined {
  if (result.error !== undefined) return `pnpm ${script} did not start: ${result.error.message}`;
  if (result.signal !== null) return `pnpm ${script} ended with ${result.signal}`;
  if (result.status !== 0) return `pnpm ${script} exited ${String(result.status)}`;
  return undefined;
}

/** Emission failures for the four original packages: name mismatch or missing file. */
export function checkEmissions(reader: EmissionReader, packages: readonly PackageEmission[]): string[] {
  const failures: string[] = [];
  for (const pkg of packages) {
    let manifest: string;
    try {
      manifest = reader.readPackageJson(pkg.folder);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      failures.push(`packages/${pkg.folder}/package.json is missing: ${reason}`);
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(manifest);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      failures.push(`packages/${pkg.folder}/package.json is invalid: ${reason}`);
      continue;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed) || !('name' in parsed) || parsed.name !== pkg.name) {
      failures.push(`packages/${pkg.folder}/package.json has the wrong name, not "${pkg.name}"`);
    }
    const kinds: readonly ('js' | 'd.ts')[] = ['js', 'd.ts'];
    for (const kind of kinds) {
      try {
        if (!reader.emissionExists(pkg.folder, pkg.entry, kind)) {
          failures.push(`packages/${pkg.folder}/dist/${pkg.entry}.${kind} is missing`);
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        failures.push(`packages/${pkg.folder}/dist/${pkg.entry}.${kind} could not be inspected: ${reason}`);
      }
    }
  }
  return failures;
}

function attemptScript(gates: GateReport[], runScript: ScriptRunner, script: string): boolean {
  let result: ScriptResult;
  try {
    result = runScript(script);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    gates.push({ gate: script, ok: false, detail: `pnpm ${script} did not start: ${reason}` });
    return false;
  }
  const failure = describeScriptFailure(script, result);
  if (failure !== undefined) {
    gates.push({ gate: script, ok: false, detail: result.output === '' ? failure : `${failure}\n${result.output}` });
    return false;
  }
  gates.push({ gate: script, ok: true, detail: `pnpm ${script} passed` });
  return true;
}

/** Runs typecheck, lint, test, build, emissions, then bench:check; stops at first failure. */
export function runCandidate(input: CandidateInput): CandidateReport {
  const gates: GateReport[] = [];
  const before: readonly string[] = ['typecheck', 'lint', 'test', 'build'];
  for (const script of before) {
    if (!attemptScript(gates, input.runScript, script)) return { host: input.host, gates, ok: false };
  }
  const emissionFailures = checkEmissions(input.reader, packageEmissions);
  if (emissionFailures.length > 0) {
    gates.push({ gate: 'emissions', ok: false, detail: emissionFailures.join('\n') });
    return { host: input.host, gates, ok: false };
  }
  gates.push({ gate: 'emissions', ok: true, detail: 'four original package names and emissions present' });
  if (!attemptScript(gates, input.runScript, 'bench:check')) return { host: input.host, gates, ok: false };
  return { host: input.host, gates, ok: true };
}
