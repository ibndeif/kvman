import { manifestSchema, type Issue, type Manifest } from '@kvman/protocol';
import type { ExtensionDefinition } from '@kvman/sdk';
import { kernelProblem, ProblemError } from '../problems.ts';
import { kernelEventPayloads } from '../registry/kernel-types.ts';
import { validateManifest } from '../validation/manifest-validation.ts';
import { firstDifference } from './first-difference.ts';
import { manifestCandidate } from './manifest-candidate.ts';
import { Recording, type HandlerDefinition, type RecordedSchemas, type RegisteredFunction } from './recording.ts';
import { createRecordingExt } from './recording-ext.ts';

// The package's identity from its package.json (06 §6.2): `meta.name` must repeat its name (05 §5.1).
export type RecordOptions = { packageName: string; version: string; correlationId: string };

export type ExtensionRecording = {
  manifest: Manifest;
  warnings: Issue[];
  functions: ReadonlyMap<string, RegisteredFunction>;
  handlers: ReadonlyMap<string, HandlerDefinition>;
  schemas: RecordedSchemas;
};

type Failure = { detail: string; hint: string } | { issues: Issue[] };

function manifestInvalid(options: RecordOptions, failure: Failure): ProblemError {
  return new ProblemError(kernelProblem('EXT_MANIFEST_INVALID', { correlationId: options.correlationId, ...failure }));
}

function isThenable(value: unknown): boolean {
  return typeof value === 'object' && value !== null && 'then' in value;
}

function runSetup(definition: ExtensionDefinition, options: RecordOptions): Recording {
  const recording = new Recording();
  const { ext, close } = createRecordingExt(recording, () => manifestInvalid(options, { detail: 'ext is closed after setup returns', hint: 'keep ext inside setup' }));
  let returned: unknown;
  try {
    returned = definition.setup(ext);
  } catch (error) {
    const detail = `setup threw: ${error instanceof Error ? error.message : String(error)}`;
    throw manifestInvalid(options, { detail, hint: 'setup only registers; fix the error it throws' });
  } finally {
    close();
  }
  if (isThenable(returned)) throw manifestInvalid(options, { detail: 'setup is synchronous', hint: 'make setup a plain function; register everything before it returns' });
  return recording;
}

function identityIssues(definition: ExtensionDefinition, options: RecordOptions): Issue[] {
  if (definition.meta.name === options.packageName) return [];
  return [{ path: 'meta.name', message: `meta.name "${definition.meta.name}" differs from the package name`, hint: `set meta.name to "${options.packageName}", the name in package.json` }];
}

// Runs setup twice with a recording ext (05 §5.1, §5.12): the first run gives the manifest and the functions, the
// second proves setup is deterministic. Every error is collected and reported once (ADR 0042); warnings alone leave
// the recording valid (ADR 0108).
export function recordExtension(definition: ExtensionDefinition, options: RecordOptions): ExtensionRecording {
  const first = runSetup(definition, options);
  const second = runSetup(definition, options);
  const candidate = manifestCandidate(definition.meta, options.version, first);
  const recorded = [...first.issues, ...identityIssues(definition, options)];
  const difference = firstDifference(candidate, manifestCandidate(definition.meta, options.version, second));
  if (difference !== undefined) {
    recorded.push({
      path: difference, message: 'setup recorded something different on its second run; setup must be deterministic',
      hint: 'register the same things on every run; setup reads no clock, random numbers, or state',
    });
  }
  const issues = validateManifest(candidate, { kernelEvents: kernelEventPayloads() }, recorded);
  const errors = issues.filter((issue) => issue.severity !== 'warning');
  const parsed = manifestSchema.safeParse(candidate);
  if (!parsed.success || errors.length > 0) throw manifestInvalid(options, { issues: errors });
  const warnings = issues.filter((issue) => issue.severity === 'warning');
  return { manifest: parsed.data, warnings, functions: first.functions, handlers: first.handlers, schemas: first.schemas };
}
