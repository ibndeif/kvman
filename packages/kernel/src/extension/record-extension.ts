import { manifestSchema, type Issue, type Manifest } from '@kvman/protocol';
import type { ExtensionDefinition } from '@kvman/sdk';
import { kernelProblem, ProblemError } from '../problems.ts';
import { firstDifference } from './first-difference.ts';
import { manifestCandidate } from './manifest-candidate.ts';
import { Recording, type HandlerDefinition, type RecordedSchemas, type RegisteredFunction } from './recording.ts';
import { createRecordingExt } from './recording-ext.ts';
import { registrationIssues } from './registration-rules.ts';

export type RecordOptions = { version: string; correlationId: string };

export type ExtensionRecording = {
  manifest: Manifest;
  functions: ReadonlyMap<string, RegisteredFunction>;
  handlers: ReadonlyMap<string, HandlerDefinition>;
  schemas: RecordedSchemas;
};

function manifestInvalid(options: RecordOptions, context: { detail?: string; issues?: Issue[] }): ProblemError {
  return new ProblemError(kernelProblem('EXT_MANIFEST_INVALID', { correlationId: options.correlationId, ...context }));
}

function isThenable(value: unknown): boolean {
  return typeof value === 'object' && value !== null && 'then' in value;
}

function runSetup(definition: ExtensionDefinition, options: RecordOptions): Recording {
  const recording = new Recording();
  const { ext, close } = createRecordingExt(recording, () => manifestInvalid(options, { detail: 'ext is closed after setup returns' }));
  let returned: unknown;
  try {
    returned = definition.setup(ext);
  } catch (error) {
    throw manifestInvalid(options, { detail: `setup threw: ${error instanceof Error ? error.message : String(error)}` });
  } finally {
    close();
  }
  if (isThenable(returned)) throw manifestInvalid(options, { detail: 'setup is synchronous' });
  return recording;
}

// Runs setup twice with a recording ext (05 §5.1, §5.12): the first run gives the manifest and the functions, the
// second proves setup is deterministic. Every mistake is collected and reported once (ADR 0042).
export function recordExtension(definition: ExtensionDefinition, options: RecordOptions): ExtensionRecording {
  const first = runSetup(definition, options);
  const second = runSetup(definition, options);
  const candidate = manifestCandidate(definition.meta, options.version, first);
  const issues = [...first.issues, ...registrationIssues(definition.meta.namespace, first)];
  const difference = firstDifference(candidate, manifestCandidate(definition.meta, options.version, second));
  if (difference !== undefined) {
    issues.push({ path: difference, message: 'setup recorded something different on its second run; setup must be deterministic' });
  }
  const parsed = manifestSchema.safeParse(candidate);
  const reported = new Set(issues.map((issue) => issue.path));
  const schemaIssues = parsed.success
    ? []
    : parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })).filter((issue) => !reported.has(issue.path));
  if (!parsed.success || issues.length > 0) throw manifestInvalid(options, { issues: [...issues, ...schemaIssues] });
  return { manifest: parsed.data, functions: first.functions, handlers: first.handlers, schemas: first.schemas };
}
