import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { hostPlatform, packFolder, pnpmExecutable, toolEnvironment } from '@kvman/kernel';

// Extension packages written as plain JavaScript, the way they are published: package.json with its built `main`.
export type PackageSpec = {
  name: string;
  version?: string;
  description?: string;
  main?: string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  // Extra package.json fields, or undefined to leave a field out.
  fields?: Record<string, unknown>;
  files: Record<string, string>;
};

export function temporary(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `kvman-${prefix}-`));
}

export function writePackage(spec: PackageSpec, folder = temporary('package')): string {
  mkdirSync(folder, { recursive: true });
  const packageJson: Record<string, unknown> = {
    name: spec.name, version: spec.version ?? '1.0.0', description: spec.description ?? 'A test package.', type: 'module', main: spec.main ?? 'dist/extension.js',
    peerDependencies: spec.peerDependencies ?? { '@kvman/sdk': '*' }, ...(spec.dependencies === undefined ? {} : { dependencies: spec.dependencies }), ...spec.fields,
  };
  writeFileSync(join(folder, 'package.json'), JSON.stringify(Object.fromEntries(Object.entries(packageJson).filter(([, value]) => value !== undefined))));
  for (const [path, content] of Object.entries(spec.files)) {
    mkdirSync(dirname(join(folder, path)), { recursive: true });
    writeFileSync(join(folder, path), content);
  }
  return folder;
}

// A package tarball as npm publishes it, packed by the kernel's bundled pnpm with scripts disabled.
export function packPackage(folder: string): Promise<string> {
  const work = temporary('pack');
  const tools = { pnpm: pnpmExecutable(hostPlatform()), registry: 'http://127.0.0.1:9/', environment: toolEnvironment(join(work, 'home'), process.env), signal: new AbortController().signal };
  return packFolder(folder, join(work, 'out'), tools);
}

// An extension module: `setup` registers one command, `<namespace>.echo`, which replies with its input.
export function extensionSource(name: string, namespace: string, extra = ''): string {
  return `import { defineExtension, z } from '@kvman/sdk';
${extra}
export default defineExtension({ name: '${name}', namespace: '${namespace}', title: 'Sample', description: 'A sample extension.' }, (ext) => {
  ext.registerCommand('${namespace}.echo', { description: 'Replies with its input.', input: z.object({ text: z.string() }), output: z.object({ text: z.string() }), handle: async (input) => ({ text: input.text }) });
});
`;
}

// Sample (the scenarios' fixture package): `@acme/sample`, namespace `sample`, command `sample.echo`.
export function samplePackage(overrides: Partial<PackageSpec> = {}): PackageSpec {
  return { name: '@acme/sample', files: { 'dist/extension.js': extensionSource('@acme/sample', 'sample') }, ...overrides };
}
