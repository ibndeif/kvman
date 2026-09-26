import type { Capabilities } from '@kvman/protocol';

// An extension's granted capabilities in a workspace, or in no workspace for a global invocation (the intersection
// across the workspaces that enable it), read from the applied presets (ADRs 0052, 0123).
export interface GrantsSource {
  capabilities(extension: string, workspaceId: string | undefined): Capabilities | undefined;
  // ADR 0133: the agent tool types a workspace's applied preset turns off (every `extensions[*].disable`).
  disabledTools(workspaceId: string): ReadonlySet<string>;
}
