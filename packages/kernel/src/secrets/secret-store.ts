import { closeSync, fchmodSync, fsyncSync, openSync, readFileSync, renameSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { secretsFileSchema } from '@kvman/protocol';
import { kernelProblem, ProblemError } from '../problems.ts';

// A secret change of a committed unit (04 §4.7): set, clear, or every secret of an uninstalled extension (ADR 0120).
export type SecretChange =
  | { kind: 'set'; extension: string; name: string; value: string }
  | { kind: 'clear'; extension: string; name: string }
  | { kind: 'clear-extension'; extension: string };

function keyOf(extension: string, name: string): string {
  return `${extension}/${name}`;
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function readValues(file: string, correlationId: string): Map<string, string> {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    if (isMissing(error)) return new Map();
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ProblemError(kernelProblem('INTERNAL', { correlationId, detail: `${file} is not valid JSON`, hint: 'restore the file from a backup, or remove it to start without secrets' }));
  }
  const values = secretsFileSchema.safeParse(parsed);
  if (!values.success) throw new ProblemError(kernelProblem('INTERNAL', { correlationId, detail: `${file} is not an object of string values`, hint: 'restore the file from a backup, or remove it to start without secrets' }));
  return new Map(Object.entries(values.data));
}

// secrets.json (04 §4.7, ADR 0126): loaded at boot step 3, read from memory, and replaced whole on every change so
// the file is always the old or the new version.
export class SecretStore {
  readonly #file: string;
  #values: Map<string, string>;

  private constructor(file: string, values: Map<string, string>) {
    this.#file = file;
    this.#values = values;
  }

  // A missing file is an empty store; one that does not parse refuses the start, naming the file, never its contents.
  static load(home: string, correlationId: string): SecretStore {
    const file = join(home, 'secrets.json');
    return new SecretStore(file, readValues(file, correlationId));
  }

  get(extension: string, name: string): string | undefined {
    return this.#values.get(keyOf(extension, name));
  }

  // Writes a new file (0600), fsyncs it, and renames it over the old one; the values change only once it is in place.
  apply(changes: readonly SecretChange[]): void {
    const next = new Map(this.#values);
    for (const change of changes) {
      if (change.kind === 'set') next.set(keyOf(change.extension, change.name), change.value);
      else if (change.kind === 'clear') next.delete(keyOf(change.extension, change.name));
      else for (const key of [...next.keys()].filter((candidate) => candidate.startsWith(`${change.extension}/`))) next.delete(key);
    }
    const temporary = `${this.#file}.tmp`;
    const descriptor = openSync(temporary, 'w', 0o600);
    try {
      fchmodSync(descriptor, 0o600);
      writeSync(descriptor, JSON.stringify(Object.fromEntries([...next].sort(([left], [right]) => (left < right ? -1 : 1)))));
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    renameSync(temporary, this.#file);
    this.#values = next;
  }
}
