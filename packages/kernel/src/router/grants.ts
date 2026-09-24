import type { Capabilities } from '@kvman/protocol';

// An extension's granted capabilities in a workspace, or in no workspace for a global invocation. M2.4 implements
// it over the database, including the intersection across workspaces (ADR 0052); until then it is given as data.
export interface GrantsSource {
  capabilities(extension: string, workspaceId: string | undefined): Capabilities | undefined;
}
