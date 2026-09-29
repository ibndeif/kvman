import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Json } from '@kvman/protocol';
import type { ExtensionDefinition } from '@kvman/sdk';
import { driverExtension } from './driver-extension.ts';
import { fakeProviderExtension, type FakeProviderOptions } from './fake-provider-extension.ts';
import type { TestPackage } from './placement.ts';

// The module beside this one in the same build: `.ts` from the sources, `.js` from dist.
function sibling(name: string): { file: string; source: string } {
  const file = fileURLToPath(new URL(`./${name}${extname(fileURLToPath(import.meta.url))}`, import.meta.url));
  return { file: basename(file), source: readFileSync(file, 'utf8') };
}

// ADR 0165: an extension built from data runs in a host from a generated entry that calls its builder with the
// same data, next to a copy of the builder's module.
function generated(builder: string, moduleName: string, argument: Json, definition: ExtensionDefinition): TestPackage {
  const module = sibling(moduleName);
  const entry = `entry${extname(module.file)}`;
  const text = `import { ${builder} } from './${module.file}';\nexport default ${builder}(${JSON.stringify(argument)});\n`;
  return { definition, entry, files: new Map([[module.file, module.source], [entry, text]]) };
}

export function driverPackage(types: string[]): TestPackage {
  return generated('driverExtension', 'driver-extension', types, driverExtension(types));
}

export function fakeProviderPackage(options: FakeProviderOptions): TestPackage {
  return generated('fakeProviderExtension', 'fake-provider-extension', options, fakeProviderExtension(options));
}
