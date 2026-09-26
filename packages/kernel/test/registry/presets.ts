import type { Capabilities, Preset } from '@kvman/protocol';

export const sharedGrant: Capabilities = { isolation: 'shared', requested: [], derived: { subscribes: [], providesLlm: [] } };

// ADR 0124: the smallest applied preset, enabling each named extension from a local snapshot with its grant.
export function appliedPreset(enabled: Record<string, { digest: string; grants?: Capabilities }>, revision = 1): Preset {
  const extensions = Object.fromEntries(Object.entries(enabled).map(([name, { digest, grants }]) => [
    name, { source: `local:${digest}`, digest, enabled: true, grants: grants ?? sharedGrant },
  ]));
  return { presetVersion: 1, id: 'test', name: 'Test', revision, app: { title: 'Test', home: '/' }, extensions };
}
