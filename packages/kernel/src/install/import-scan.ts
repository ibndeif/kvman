import { readdir, readFile } from 'node:fs/promises';
import { isBuiltin } from 'node:module';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { Issue, PackageJson } from '@kvman/protocol';
import { init, parse } from 'es-module-lexer';
import { sourceInvalid } from './install-failure.ts';

const scannedExtensions = new Set(['.js', '.mjs', '.cjs']);

async function scannedFiles(folder: string, current = folder): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const file = join(current, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules') files.push(...(await scannedFiles(folder, file)));
    else if (entry.isFile() && scannedExtensions.has(extname(entry.name))) files.push(file);
  }
  return files.sort();
}

function packageNameOf(specifier: string): string {
  const segments = specifier.split('/');
  return specifier.startsWith('@') ? segments.slice(0, 2).join('/') : (segments[0] ?? specifier);
}

function insideFolder(folder: string, target: string): boolean {
  const path = relative(folder, target);
  return !isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`);
}

const barePackage = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*(?:\/.*)?$/;

type Verdict = 'allowed' | 'undeclared' | 'outside' | 'form';

function verdictOf(folder: string, file: string, specifier: string, packageJson: PackageJson): Verdict {
  if (isBuiltin(specifier)) return 'allowed';
  if (specifier === '.' || specifier === '..' || specifier.startsWith('./') || specifier.startsWith('../')) {
    return insideFolder(folder, resolve(dirname(file), specifier)) ? 'allowed' : 'outside';
  }
  if (!barePackage.test(specifier)) return 'form';
  const name = packageNameOf(specifier);
  if (name === packageJson.name) return 'form';
  const declared = packageJson.dependencies?.[name] !== undefined || packageJson.peerDependencies?.[name] !== undefined;
  return declared ? 'allowed' : 'undeclared';
}

function refusal(path: string, specifier: string, verdict: Exclude<Verdict, 'allowed'>): Error {
  const messages: Record<typeof verdict, string> = {
    undeclared: `${path} imports ${specifier}, which package.json does not declare`,
    outside: `${path} imports ${specifier}, which leaves the package`,
    form: `${path} imports ${specifier}; only Node built-ins, relative files inside the package, and declared packages may be imported`,
  };
  const hint = verdict === 'undeclared' ? `add ${packageNameOf(specifier)} to dependencies or peerDependencies` : undefined;
  return sourceInvalid(messages[verdict], { params: { file: path, specifier }, ...(hint === undefined ? {} : { hint }) });
}

// 06 §6.2 step 2 and ADR 0117: every static import, and every dynamic import with a literal specifier, of the
// extension package's own files names a built-in, a relative file inside the package, or a declared package. A
// computed dynamic import cannot be checked and is returned as a warning.
export async function scanImports(folder: string, packageJson: PackageJson): Promise<Issue[]> {
  await init;
  const warnings: Issue[] = [];
  for (const file of await scannedFiles(folder)) {
    const path = relative(folder, file).split(sep).join('/');
    const source = await readFile(file, 'utf8');
    let imports: ReturnType<typeof parse>[0];
    try {
      [imports] = parse(source, path);
    } catch {
      throw sourceInvalid(`${path} cannot be parsed`, { params: { file: path } });
    }
    for (const found of imports) {
      if (found.type === 'import-meta') continue;
      if (found.specifier === undefined) {
        warnings.push({ path, message: 'a dynamic import with a computed specifier cannot be checked', code: 'DYNAMIC_IMPORT', severity: 'warning' });
        continue;
      }
      const verdict = verdictOf(folder, file, found.specifier, packageJson);
      if (verdict !== 'allowed') throw refusal(path, found.specifier, verdict);
    }
  }
  return warnings;
}
