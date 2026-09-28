import { createHash } from 'node:crypto';
import { canonicalJson, protocolVersion } from '@kvman/protocol';
import { compareText, type RegistrySources } from './registry-sources.ts';

// ADR 0159: the SHA-256 of every input the registry is computed from, so it changes exactly when the applied preset
// is written, an enabled extension's active version changes, or one is quarantined or unquarantined.
export function registryRevision(sources: RegistrySources): string {
  const enabled = [...sources.enabled].sort((left, right) => compareText(left.manifest.meta.name, right.manifest.meta.name));
  const inputs = {
    workspaceId: sources.workspaceId,
    presetRevision: sources.presetRevision,
    extensions: enabled.map((extension) => [extension.manifest.meta.name, extension.digest]),
    quarantined: enabled.filter((extension) => extension.quarantined).map((extension) => extension.manifest.meta.name),
    protocolVersion,
  };
  return createHash('sha256').update(canonicalJson(inputs)).digest('hex');
}

// The translations answer also depends on the saved language (08 §8.6).
export function translationsTag(revision: string, locale: string): string {
  return `${revision}:${locale}`;
}
