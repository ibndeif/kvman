import { readFile, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { packageJsonSchema, type PackageJson } from '@kvman/protocol';
import satisfies from 'semver/functions/satisfies.js';
import { isUnreadable } from './file-errors.ts';
import { sourceInvalid } from './install-failure.ts';

export const sdkPackage = '@kvman/sdk';

// The identity fields 06 §6.2 step 2 requires, as a checked package has them.
export type CheckedPackage = { name: string; version: string; description: string; main: string; packageJson: PackageJson };

export async function readPackageJson(folder: string): Promise<PackageJson> {
  let text: string;
  try {
    text = await readFile(join(folder, 'package.json'), 'utf8');
  } catch (error) {
    if (isUnreadable(error)) throw sourceInvalid('the package has no package.json');
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw sourceInvalid('package.json is not valid JSON');
  }
  const result = packageJsonSchema.safeParse(parsed);
  if (!result.success) throw sourceInvalid(`package.json is not valid: ${result.error.issues[0]?.message ?? 'unknown'}`, { params: { path: result.error.issues[0]?.path.join('.') ?? '' } });
  return result.data;
}

function requiredField(packageJson: PackageJson, field: 'name' | 'version' | 'description' | 'main'): string {
  const value = packageJson[field];
  if (value === undefined || !/\S/.test(value)) throw sourceInvalid(`package.json has no ${field}`, { params: { field } });
  return value;
}

function withinFolder(folder: string, file: string): boolean {
  const path = relative(folder, file);
  return !isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`);
}

async function isFile(file: string): Promise<boolean> {
  try {
    return (await stat(file)).isFile();
  } catch (error) {
    if (isUnreadable(error)) return false;
    throw error;
  }
}

// 06 §6.2 step 2 and ADR 0117: the identity fields, the SDK as a satisfied peer and never a dependency, and a built
// `main` inside the package, since kvman never runs build scripts.
export async function checkPackage(folder: string, packageJson: PackageJson, sdkVersion: string): Promise<CheckedPackage> {
  const name = requiredField(packageJson, 'name');
  const version = requiredField(packageJson, 'version');
  const description = requiredField(packageJson, 'description');
  const main = requiredField(packageJson, 'main');
  if (packageJson.dependencies?.[sdkPackage] !== undefined) throw sourceInvalid(`declare ${sdkPackage} in peerDependencies`, { hint: `move ${sdkPackage} from dependencies to peerDependencies` });
  const range = packageJson.peerDependencies?.[sdkPackage];
  if (range !== undefined && !satisfies(sdkVersion, range)) throw sourceInvalid(`needs ${sdkPackage} ${range}; this kvman has ${sdkVersion}`, { params: { range, version: sdkVersion } });
  const entry = resolve(folder, main);
  if (!withinFolder(folder, entry) || !(await isFile(entry))) {
    throw sourceInvalid(`main ${main} does not exist; publish or commit the built files`, { params: { main } });
  }
  return { name, version, description, main, packageJson };
}
