import { matchesTypePattern, type Access, type Capabilities, type TypeEntry } from '@kvman/protocol';
import type { KernelRegistry } from '../registry/kernel-registry.ts';
import { kernelOwner } from '../registry/kernel-types.ts';
import type { Sender } from '../storage/commit-unit.ts';
import type { GrantsSource } from './grants.ts';
import { Refusal } from './refusal.ts';

export type CallGrants = { grants: GrantsSource; registry: () => KernelRegistry };

// A type the caller reaches: its owner and definition.
export type CallTarget = { owner: string; entry: TypeEntry };

function byCalls(capabilities: Capabilities, entry: TypeEntry): boolean {
  if (entry.kind === 'event' || entry.access === 'internal' || entry.access === 'user') return false;
  return capabilities.requested.some((capability) => capability.name === 'calls' && capability.types.some((pattern) => matchesTypePattern(pattern, entry.type)));
}

// ADR 0133: `tools` reaches the agent tools of the extensions enabled in the calling invocation's workspace that its
// applied preset does not turn off; a global invocation has no tool set.
function byTools(options: CallGrants, capabilities: Capabilities, { owner, entry }: CallTarget, workspaceId: string | undefined): boolean {
  if (entry.kind === 'event' || entry.agentTool === undefined || workspaceId === undefined) return false;
  if (!capabilities.requested.some((capability) => capability.name === 'tools')) return false;
  return options.registry().isEnabled(owner, workspaceId) && !options.grants.disabledTools(workspaceId).has(entry.type);
}

// 05 §5.7 for commands and queries: an extension (or its process) calls its own types freely; a foreign type needs
// a `calls` pattern covering it (never a foreign internal or user type) or, for an agent tool, `tools`. The grant is
// the one of the calling invocation's workspace, or the intersection for a global invocation (ADR 0133). kernel.*
// types apply their own Who rule instead (03 §3.8, ADR 0079).
export function checkCallCapability(options: CallGrants, sender: Sender, target: CallTarget, workspaceId: string | undefined): void {
  const acting = sender.extension;
  const { owner, entry } = target;
  if (acting === undefined || acting === owner || owner === kernelOwner) return;
  const capabilities = options.grants.capabilities(acting, workspaceId);
  if (capabilities !== undefined && (byCalls(capabilities, entry) || byTools(options, capabilities, target, workspaceId))) return;
  throw new Refusal('CAPABILITY_DENIED', {
    detail: `${acting} may not call "${entry.type}" of ${owner}`,
    hint: `add ext.requestCapability('calls', { types: ['${entry.type}'] })`,
  });
}

function accessAllows(access: Access, sender: Sender, owner: string): boolean {
  const { address } = sender;
  if (address === 'kernel' || access === 'all') return true;
  if (access === 'user') return address.startsWith('user:');
  if (access === 'extensions') return address.startsWith('ext:') || address.startsWith('proc:');
  return address === `ext:${owner}`;
}

// 02 §2.4 against the kernel-assigned source; the kernel may call anything.
export function checkAccess(sender: Sender, owner: string, entry: TypeEntry): void {
  if (entry.kind === 'event' || accessAllows(entry.access, sender, owner)) return;
  throw new Refusal('CALLER_NOT_ALLOWED', { detail: `"${entry.type}" has access "${entry.access}" and ${sender.address} may not send it` });
}

// 03 §3.3 step 4: an event is published only by the extension that registered it (or the kernel), and a live
// event only with ctx.live.
export function checkPublish(sender: Sender, owner: string, entry: TypeEntry): void {
  if (entry.kind === 'event' && entry.delivery === 'live') {
    throw new Refusal('CAPABILITY_DENIED', { detail: `"${entry.type}" is a live event`, hint: 'send live events with ctx.live' });
  }
  if (sender.address === 'kernel' || sender.address === `ext:${owner}`) return;
  throw new Refusal('CAPABILITY_DENIED', { detail: `only ${owner} publishes "${entry.type}"` });
}
