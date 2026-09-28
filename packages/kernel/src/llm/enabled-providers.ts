import type { KernelRegistry } from '../registry/kernel-registry.ts';

// 03 §3.12, ADR 0153: the providers a call may use, by id with their extension: those of extensions enabled in its
// workspace, or in any workspace for a call without one, never a quarantined extension's.
export function enabledProviders(registry: KernelRegistry, enabled: ReadonlyMap<string, readonly string[]>, workspaceId: string | undefined): Map<string, string> {
  const workspaces = workspaceId === undefined ? [...enabled.keys()] : [workspaceId];
  const providers = new Map<string, string>();
  for (const manifest of workspaces.flatMap((workspace) => registry.manifestsEnabledIn(workspace))) {
    if (registry.isQuarantined(manifest.meta.name)) continue;
    for (const provider of manifest.llm.providers) providers.set(provider.id, manifest.meta.name);
  }
  return providers;
}
