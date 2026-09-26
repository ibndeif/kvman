import { pathToFileURL } from 'node:url';
import { jsonSchema, type Manifest, type Problem } from '@kvman/protocol';
import type { ExtensionDefinition } from '@kvman/sdk';
import { firstDifference } from '../../extension/first-difference.ts';
import { recordExtension, type ExtensionRecording } from '../../extension/record-extension.ts';
import { kernelProblem, ProblemError } from '../../problems.ts';

export type ModuleLoad = { ok: true; extension: ExtensionRecording } | { ok: false; problem: Problem };

function isExtensionDefinition(value: unknown): value is ExtensionDefinition {
  if (typeof value !== 'object' || value === null || !('meta' in value) || !('setup' in value)) return false;
  return typeof value.meta === 'object' && value.meta !== null && typeof value.setup === 'function';
}

function invalid(correlationId: string, detail: string, params?: { path: string }): ModuleLoad {
  const problem = kernelProblem('EXT_MANIFEST_INVALID', { correlationId, detail, ...(params === undefined ? {} : { params }) });
  return { ok: false, problem };
}

// 05 §5.1 rule 5 and ADR 0071: a host imports the extension, runs setup again to bind its functions, and refuses it
// when the recording differs from the installed manifest.
export async function loadExtension(entry: string, manifest: Manifest, correlationId: string): Promise<ModuleLoad> {
  let imported: unknown;
  try {
    imported = await import(pathToFileURL(entry).href);
  } catch (error) {
    return invalid(correlationId, `the module failed to import: ${error instanceof Error ? error.name : typeof error}`);
  }
  const definition = typeof imported === 'object' && imported !== null && 'default' in imported ? imported.default : undefined;
  if (!isExtensionDefinition(definition)) return invalid(correlationId, 'the module does not export defineExtension(...) as its default');
  let recording: ExtensionRecording;
  try {
    recording = recordExtension(definition, { packageName: manifest.meta.name, version: manifest.meta.version, correlationId });
  } catch (error) {
    if (error instanceof ProblemError) return { ok: false, problem: error.problem };
    throw error;
  }
  const difference = firstDifference(jsonSchema.parse(recording.manifest), jsonSchema.parse(manifest));
  if (difference !== undefined) {
    return invalid(correlationId, `setup records something different from the installed manifest at "${difference}"`, { path: difference });
  }
  return { ok: true, extension: recording };
}
