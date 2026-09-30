import { closeSync, existsSync, fsyncSync, openSync, readFileSync, renameSync, rmSync, writeSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from '@kvman/sdk';

// Secrets live only in `secrets.json` (plan 02 §2.8): mode 0600 on Linux and macOS; on Windows, the user profile
// folder's access rules protect it. A write replaces the whole file atomically: a new file, flushed, then renamed.

const secretsSchema = z.record(z.string(), z.record(z.string(), z.string()));

type SecretValues = z.infer<typeof secretsSchema>;

export type SecretsFile = {
  get(extension: string, name: string): string | undefined;
  set(extension: string, name: string, value: string): void;
  delete(extension: string, name: string): void;
  list(): { extension: string; name: string }[];
};

const privateFileMode = 0o600;

function openPrivateFile(file: string): number {
  if (process.platform === 'win32') return openSync(file, 'wx');
  return openSync(file, 'wx', privateFileMode);
}

function writeAtomically(file: string, text: string): void {
  const temporary = path.join(path.dirname(file), `.secrets-${randomUUID()}.tmp`);
  try {
    const descriptor = openPrivateFile(temporary);
    try {
      writeSync(descriptor, text);
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    renameSync(temporary, file);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
}

export function openSecretsFile(home: string): SecretsFile {
  const file = path.join(home, 'secrets.json');
  const read = (): SecretValues => (existsSync(file) ? secretsSchema.parse(JSON.parse(readFileSync(file, 'utf8'))) : {});
  const write = (values: SecretValues): void => writeAtomically(file, `${JSON.stringify(values, null, 2)}\n`);
  return {
    get: (extension, name) => read()[extension]?.[name],
    set(extension, name, value) {
      const values = read();
      write({ ...values, [extension]: { ...values[extension], [name]: value } });
    },
    delete(extension, name) {
      const values = read();
      const { [name]: _removed, ...rest } = values[extension] ?? {};
      write({ ...values, [extension]: rest });
    },
    list: () => Object.entries(read()).flatMap(([extension, names]) => Object.keys(names).map((name) => ({ extension, name }))),
  };
}
