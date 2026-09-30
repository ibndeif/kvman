import semver from 'semver';
import { kernelProblem } from '../problems.ts';
import { kernelExtension } from '../settings/kernel-settings.ts';
import type { ReadExtension } from './manifests.ts';

// The start-time checks between extensions (plan 02 §2.9): namespaces (`kernel` is the kernel's own, ADR 0009, 32),
// the sdk peer range, dependencies and their ranges, and cycles. Extensions load in dependency order; independent ones
// keep the preset's order.

function checkNamespaces(extensions: readonly ReadExtension[]): void {
  const owners = new Map<string, string>([['kernel', kernelExtension]]);
  for (const extension of extensions) {
    const namespace = extension.manifest.kvman.namespace;
    const owner = owners.get(namespace);
    if (owner !== undefined) {
      throw kernelProblem('EXTENSION_INVALID', `${owner} and ${extension.name} both claim the namespace "${namespace}".`, { extension: extension.name, namespace });
    }
    owners.set(namespace, extension.name);
  }
}

function checkSdkRange(extension: ReadExtension, sdkVersion: string): void {
  const range = extension.manifest.peerDependencies['@kvman/sdk'];
  if (!semver.satisfies(sdkVersion, range, { includePrerelease: true })) {
    throw kernelProblem('EXTENSION_INVALID', `${extension.name} needs @kvman/sdk ${range}, but this kvman has ${sdkVersion}.`, { extension: extension.name, range });
  }
}

function checkDependencies(extension: ReadExtension, byName: ReadonlyMap<string, ReadExtension>): void {
  for (const [name, range] of Object.entries(extension.manifest.kvman.dependencies ?? {})) {
    const dependency = byName.get(name);
    if (dependency === undefined) {
      throw kernelProblem('EXTENSION_INVALID', `${extension.name} depends on ${name}, which is not in this run.`, { extension: extension.name, dependency: name });
    }
    if (!semver.satisfies(dependency.manifest.version, range, { includePrerelease: true })) {
      throw kernelProblem('EXTENSION_INVALID', `${extension.name} needs ${name} ${range}, but the run has ${dependency.manifest.version}.`, {
        extension: extension.name,
        dependency: name,
        range,
      });
    }
  }
}

function dependencyNames(extension: ReadExtension): string[] {
  return Object.keys(extension.manifest.kvman.dependencies ?? {});
}

function orderByDependencies(extensions: readonly ReadExtension[], byName: ReadonlyMap<string, ReadExtension>): ReadExtension[] {
  const ordered: ReadExtension[] = [];
  const done = new Set<string>();
  const visit = (extension: ReadExtension, chain: readonly string[]): void => {
    if (done.has(extension.name)) return;
    if (chain.includes(extension.name)) {
      const cycle = [...chain.slice(chain.indexOf(extension.name)), extension.name].join(' → ');
      throw kernelProblem('EXTENSION_INVALID', `Extension dependencies form a cycle: ${cycle}.`, { cycle });
    }
    for (const name of dependencyNames(extension)) {
      const dependency = byName.get(name);
      if (dependency !== undefined) visit(dependency, [...chain, extension.name]);
    }
    done.add(extension.name);
    ordered.push(extension);
  };
  for (const extension of extensions) visit(extension, []);
  return ordered;
}

// A dependent whose range a reloaded extension no longer satisfies: the reload applies, and this is logged.
export type RangeWarning = { extension: string; dependency: string; range: string };

// The checks of a hot reload (plan 02 §2.9, ADR 0009, 26): the reloaded extensions must pass every start rule
// themselves, but a dependent whose range they no longer satisfy only warns.
export function checkReload(extensions: readonly ReadExtension[], reloaded: ReadonlySet<string>, sdkVersion: string): { ordered: ReadExtension[]; warnings: RangeWarning[] } {
  checkNamespaces(extensions);
  const byName = new Map(extensions.map((extension) => [extension.name, extension]));
  const warnings: RangeWarning[] = [];
  for (const extension of extensions) {
    if (reloaded.has(extension.name)) {
      checkSdkRange(extension, sdkVersion);
      checkDependencies(extension, byName);
      continue;
    }
    for (const [name, range] of Object.entries(extension.manifest.kvman.dependencies ?? {})) {
      const dependency = byName.get(name);
      if (reloaded.has(name) && dependency !== undefined && !semver.satisfies(dependency.manifest.version, range, { includePrerelease: true })) {
        warnings.push({ extension: extension.name, dependency: name, range });
      }
    }
  }
  return { ordered: orderByDependencies(extensions, byName), warnings };
}

// The extensions that depend on any of `names`, directly or not.
export function dependentsOf(extensions: readonly ReadExtension[], names: ReadonlySet<string>): Set<string> {
  const found = new Set<string>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const extension of extensions) {
      if (found.has(extension.name) || names.has(extension.name)) continue;
      if (dependencyNames(extension).some((name) => names.has(name) || found.has(name))) {
        found.add(extension.name);
        grew = true;
      }
    }
  }
  return found;
}

export function checkAndOrder(extensions: readonly ReadExtension[], sdkVersion: string): ReadExtension[] {
  checkNamespaces(extensions);
  const byName = new Map(extensions.map((extension) => [extension.name, extension]));
  for (const extension of extensions) {
    checkSdkRange(extension, sdkVersion);
    checkDependencies(extension, byName);
  }
  return orderByDependencies(extensions, byName);
}
