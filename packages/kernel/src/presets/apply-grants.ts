import type { Capabilities } from '@kvman/protocol';
import { derivedCapabilities, grantDifferences, type GrantDifferences } from '../registry/grant-validity.ts';
import type { ResolvedVersion } from './version-resolution.ts';

export type PlannedExtension = { name: string; version: ResolvedVersion; grants: Capabilities };

export type ApplyGrant = { ok: true; grants: Capabilities } | { ok: false; differences: GrantDifferences };

// ADR 0148: a builtin: entry is granted what the bundled manifest requests and derives, keeping the preset's
// isolation when that level is still allowed for it, else shared (builtins run shared, ADR 0128); an npm: or git:
// entry is pinned by its integrity, so its grants must equal the manifest's exactly.
export function grantFor(version: ResolvedVersion): ApplyGrant {
  const derived = derivedCapabilities(version.manifest);
  if (version.builtin) {
    const isolation = version.entry.grants.isolation;
    const differences = grantDifferences(version.manifest, { ...derived, isolation }, true);
    return { ok: true, grants: { ...derived, isolation: differences?.isolation === undefined ? isolation : 'shared' } };
  }
  const differences = grantDifferences(version.manifest, version.entry.grants, false);
  return differences === undefined ? { ok: true, grants: version.entry.grants } : { ok: false, differences };
}
