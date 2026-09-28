import type { Manifest, Preset } from '@kvman/protocol';

// One extension the applied preset enables, as the registry and its revision see it.
export type EnabledExtension = { manifest: Manifest; digest: string; quarantined: boolean };

// Everything a workspace's UI registry is computed from (08 §8.6, ADR 0159).
export type RegistrySources = { workspaceId: string; preset: Preset; presetRevision: number; enabled: readonly EnabledExtension[] };

// Only extensions that are enabled and not quarantined contribute (ADR 0159), in name order.
export function activeManifests(sources: RegistrySources): Manifest[] {
  return sources.enabled.filter((extension) => !extension.quarantined).map((extension) => extension.manifest)
    .sort((left, right) => compareText(left.meta.name, right.meta.name));
}

// Order by UTF-16 code units: ids and package names are ASCII, and the order never depends on the host's locale.
export function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
