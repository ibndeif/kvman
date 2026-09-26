# ADR 0133 — `kernel.subscribers.list` and the `tools` set

- **Status**: accepted
- **Date**: 2026-09-26
- **Milestone**: M2.4
- **Decided by**: the product owner

## Question

- `03` §3.8 lists "extensions enabled in the workspace whose **granted** subscriptions match the event `type`". Grants hold only foreign subscriptions (`05` §5.7); an extension's own events and `kernel.*` events need no grant.
- `05` §5.7 lets `tools` call "every command and query flagged `agentTool` that is enabled in the invocation's workspace and not turned off by the preset's `disable`". A global invocation has no workspace.

## Options

- **Subscribers:**
  1. **Every extension that would receive the event.**
  2. Only foreign subscriptions held in grants.
- **Tools from a global invocation:**
  1. **None.**
  2. The tools enabled, and not disabled, in every workspace that enables the calling extension.

## Decision

Option 1 in both cases.

**`kernel.subscribers.list { workspaceId, type }`** lists every extension enabled in the workspace that has a subscription matching `type` and would receive it:

- foreign subscriptions through the extension's grant there;
- subscriptions to its own namespace's events, and to `kernel.*` events, without a grant.

Further rules:

- Quarantined extensions are listed with `status: 'quarantined'`.
- Each item's `calls` is the extension's granted `calls` patterns in that workspace.
- A workspace without a row fails `WORKSPACE_INVALID`.
- `type` is an exact event type; a pattern fails `VALIDATION_FAILED`.
- A type that no extension registers, and a live event, return `[]`.
- Items are sorted by name.

**The `tools` set** of an invocation in a workspace is every command and query flagged `agentTool` that:

- belongs to an extension enabled in that workspace;
- is not listed in any `extensions[*].disable` of the workspace's applied preset.

A global invocation has no tool set: `tools` covers nothing there, and it needs `calls`.

**Whose grant.** The grant checked for a call is the one of the calling invocation's workspace, or the intersection of grants for a global invocation (`06` §6.4). It is never chosen by the target's scope.

## Consequences

`03` §3.8's `kernel.subscribers.list` row and `05` §5.7's `tools` row are corrected.
