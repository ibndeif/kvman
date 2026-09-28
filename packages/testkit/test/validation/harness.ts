import { kernelEventPayloads, kernelValues, ProblemError, recordExtension, validateManifest } from '@kvman/kernel';
import { jsonObjectSchema, type Issue, type Json, type JsonObject } from '@kvman/protocol';
import { defineExtension, type Ext } from '@kvman/sdk';
import fixture from '../../../protocol/test/fixtures/pdf-manifest.json' with { type: 'json' };

export const correlationId = '01JAZ3K4M5N6P7Q8R9S0T1V2W3';
export const reason = 'Needed.';

export type RecordingOptions = { namespace?: string; packageName?: string };

// The issues of one recording: its warnings when it succeeds, its problem's issues when it fails.
export function recordedIssues(setup: (ext: Ext) => void, options: RecordingOptions = {}): Issue[] {
  const namespace = options.namespace ?? 'pdf';
  const definition = defineExtension({ name: `@acme/${namespace}`, namespace, title: 'Test', description: 'A test extension.' }, setup);
  try {
    return recordExtension(definition, { packageName: options.packageName ?? `@acme/${namespace}`, version: '1.0.0', correlationId }).warnings;
  } catch (error) {
    if (error instanceof ProblemError) return error.problem.issues ?? [];
    throw error;
  }
}

export function validatedIssues(manifest: unknown): Issue[] {
  return validateManifest(jsonObjectSchema.parse(manifest), { kernelEvents: kernelEventPayloads() });
}

// The issues of one recording checked with the kernel's value checker (ADR 0157): recording runs every UI rule
// except value checks, so the recorded manifest is validated again with `kernelValues`. When recording itself
// fails, its problem's issues are returned, as in `recordedIssues`.
export function checkedIssues(setup: (ext: Ext) => void, options: RecordingOptions = {}): Issue[] {
  const namespace = options.namespace ?? 'pdf';
  const definition = defineExtension({ name: `@acme/${namespace}`, namespace, title: 'Test', description: 'A test extension.' }, setup);
  try {
    const recording = recordExtension(definition, { packageName: options.packageName ?? `@acme/${namespace}`, version: '1.0.0', correlationId });
    return validateManifest(jsonObjectSchema.parse(recording.manifest), { kernelEvents: kernelEventPayloads(), values: kernelValues });
  } catch (error) {
    if (error instanceof ProblemError) return error.problem.issues ?? [];
    throw error;
  }
}

// The pdf example's manifest (the M0.3 fixture), changed by the test.
export function pdfManifest(change: (manifest: JsonObject) => void = () => undefined): JsonObject {
  const manifest = jsonObjectSchema.parse(structuredClone(fixture));
  change(manifest);
  return manifest;
}

export function errorsOf(issues: readonly Issue[]): Issue[] {
  return issues.filter((issue) => issue.severity !== 'warning');
}

export function warningsOf(issues: readonly Issue[]): Issue[] {
  return issues.filter((issue) => issue.severity === 'warning');
}

function child(value: Json, key: string | number): Json {
  const reached = Array.isArray(value) && typeof key === 'number' ? value[key] : !Array.isArray(value) && value !== null && typeof value === 'object' ? value[String(key)] : undefined;
  if (reached === undefined) throw new Error(`the manifest has nothing at ${String(key)}`);
  return reached;
}

// Sets one value inside a manifest built from JSON, at a path the test knows exists (the last key may be new).
export function setAt(target: Json, path: ReadonlyArray<string | number>, value: Json): void {
  const parent = path.slice(0, -1).reduce<Json>(child, target);
  const key = path.at(-1);
  if (Array.isArray(parent) && typeof key === 'number') parent[key] = value;
  else if (!Array.isArray(parent) && parent !== null && typeof parent === 'object' && key !== undefined) parent[String(key)] = value;
  else throw new Error(`cannot set ${path.join('.')}`);
}

export function removeAt(target: Json, path: ReadonlyArray<string | number>): void {
  const parent = path.slice(0, -1).reduce<Json>(child, target);
  const key = path.at(-1);
  if (!Array.isArray(parent) && parent !== null && typeof parent === 'object' && key !== undefined) delete parent[String(key)];
  else throw new Error(`cannot remove ${path.join('.')}`);
}
