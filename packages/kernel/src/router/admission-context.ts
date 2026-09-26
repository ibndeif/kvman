import { jsonByteLength, type Json, type JsonObject, type MessageKind, type TypeEntry } from '@kvman/protocol';
import type { KernelRegistry } from '../registry/kernel-registry.ts';
import type { Sender } from '../storage/commit-unit.ts';
import type { UlidGenerator } from '../ulid.ts';
import type { GrantsSource } from './grants.ts';
import type { PayloadValidators } from './payload-validators.ts';
import { Refusal } from './refusal.ts';

// Whether a workspace has a row, or is being forgotten (ADR 0122).
export type WorkspaceState = 'open' | 'forgetting' | 'unknown';

export interface WorkspaceStates {
  stateOf(workspaceId: string): WorkspaceState;
}

export type AdmissionOptions = {
  registry: () => KernelRegistry;
  grants: GrantsSource;
  workspaces: WorkspaceStates;
  validators: PayloadValidators;
  ids: UlidGenerator;
  now: () => number;
  defaultLocale: () => string;
};

export const maxPayloadBytes = 16 * 1024 * 1024;

function withArticle(kind: MessageKind): string {
  return kind === 'event' ? 'an event' : `a ${kind}`;
}

// ADR 0122: a message for a workspace without a row, or one being forgotten, is refused before anything is stored;
// the kernel's own sends pass, so a forget's cancel can deliver its continuations and onAbort commands.
export function checkWorkspace(options: AdmissionOptions, workspaceId: string | undefined, sender: Sender): void {
  if (workspaceId === undefined || sender.address === 'kernel') return;
  const state = options.workspaces.stateOf(workspaceId);
  if (state === 'open') return;
  throw new Refusal('WORKSPACE_INVALID', { detail: state === 'forgetting' ? `workspace ${workspaceId} is being forgotten` : `no workspace ${workspaceId} exists` });
}

export type Resolved = { owner: string; entry: TypeEntry; workspaceId: string | undefined };

// 03 §3.3 step 3: the owner and definition of a type for the message's workspace, of the kind the caller asked
// for (ADR 0058); a global type runs without a workspace (ADR 0048).
export function resolveType(options: AdmissionOptions, type: string, workspaceId: string | undefined, kind: MessageKind): Resolved {
  const lookup = options.registry().lookup(type, workspaceId);
  if (!lookup.ok) throw new Refusal(lookup.failure.code, lookup.failure.hint === undefined ? { detail: lookup.failure.detail } : { detail: lookup.failure.detail, hint: lookup.failure.hint });
  const { entry, extension, global } = lookup.resolved;
  if (entry.kind !== kind) throw new Refusal('TYPE_NOT_FOUND', { detail: `"${type}" is ${withArticle(entry.kind)}, not ${withArticle(kind)}` });
  return { owner: extension, entry, workspaceId: global ? undefined : workspaceId };
}

// 03 §3.3 step 5 and 02 §2.13: at most 16 MB (inline until the blob store, ADR 0055), then the manifest schema.
export function checkPayload(options: AdmissionOptions, schema: JsonObject | undefined, payload: Json): void {
  if (jsonByteLength(payload) > maxPayloadBytes) {
    throw new Refusal('PAYLOAD_TOO_LARGE', { params: { limit: 'payload', max: maxPayloadBytes }, hint: 'store large data as a blob and send its id' });
  }
  if (schema === undefined) return;
  const issues = options.validators.issues(schema, payload);
  if (issues.length > 0) throw new Refusal('VALIDATION_FAILED', { issues });
}

export function refusalOf(error: unknown): Refusal {
  if (error instanceof Refusal) return error;
  throw error;
}
