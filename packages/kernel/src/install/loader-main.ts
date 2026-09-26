import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { jsonSchema, loaderRequestSchema, type LoaderRequest, type LoaderResult } from '@kvman/protocol';
import type { ExtensionDefinition } from '@kvman/sdk';
import { recordExtension } from '../extension/record-extension.ts';
import { ProblemError } from '../problems.ts';
import { InstallFailure, sourceInvalid } from './install-failure.ts';
import { packageOfPath } from './native-code.ts';

// The install-time loader (03 §3.5, 05 §5.1 rule 4): a sandboxed process that imports the staged package, records
// `setup` twice, and sends the manifest back once. It runs with read access to the staged tree and the kernel's
// own packages only, no child processes, workers, or addons, and without node:sqlite.

class NativeAddon extends Error {
  readonly url: string;

  constructor(url: string) {
    super(`native addon ${url}`);
    this.name = 'NativeAddon';
    this.url = url;
  }
}

const sdk = import.meta.resolve('@kvman/sdk');

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === '@kvman/sdk') return { url: sdk, shortCircuit: true };
    const resolved = next(specifier, context);
    if (resolved.url.endsWith('.node')) throw new NativeAddon(resolved.url);
    return resolved;
  },
});

function nativeCause(error: unknown): NativeAddon | undefined {
  for (let current: unknown = error; current instanceof Error; current = current.cause) {
    if (current instanceof NativeAddon) return current;
  }
  return undefined;
}

function importFailure(error: unknown): Error {
  const native = nativeCause(error);
  if (native !== undefined) {
    const dependency = packageOfPath(fileURLToPath(native.url).split('\\').join('/'));
    return sourceInvalid(`import native dependency ${dependency} inside a handler`, { params: { dependency } });
  }
  if (error instanceof Error && 'code' in error && error.code === 'ERR_DLOPEN_DISABLED') return sourceInvalid('import native dependencies inside a handler');
  const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return sourceInvalid(`the module failed to import: ${reason}`);
}

function isExtensionDefinition(value: unknown): value is ExtensionDefinition {
  if (typeof value !== 'object' || value === null || !('meta' in value) || !('setup' in value)) return false;
  return typeof value.meta === 'object' && value.meta !== null && typeof value.setup === 'function';
}

async function load(request: LoaderRequest): Promise<LoaderResult> {
  let imported: unknown;
  try {
    imported = await import(pathToFileURL(request.entry).href);
  } catch (error) {
    throw importFailure(error);
  }
  const definition = typeof imported === 'object' && imported !== null && 'default' in imported ? imported.default : undefined;
  if (!isExtensionDefinition(definition)) throw sourceInvalid('the module does not export defineExtension(...) as its default');
  const { manifest } = recordExtension(definition, { packageName: request.packageName, version: request.version, correlationId: request.correlationId });
  return { ok: true, manifest: jsonSchema.parse(manifest) };
}

async function answer(value: unknown): Promise<void> {
  const request = loaderRequestSchema.parse(value);
  let result: LoaderResult;
  try {
    result = await load(request);
  } catch (error) {
    if (error instanceof ProblemError) result = { ok: false, problem: error.problem };
    else if (error instanceof InstallFailure) result = { ok: false, problem: error.problem(request.correlationId) };
    else throw error;
  }
  process.send?.(result, () => process.disconnect());
}

process.once('message', (value) => void answer(value));
