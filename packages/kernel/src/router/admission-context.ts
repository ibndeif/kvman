import { jsonByteLength, type Json, type JsonObject, type MessageKind, type TypeEntry } from '@kvman/protocol';
import type { BlobRights } from '../blobs/blob-rights.ts';
import type { KernelRegistry } from '../registry/kernel-registry.ts';
import type { Sender } from '../storage/commit-unit.ts';
import type { SpillFiles } from '../storage/spill.ts';
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
  blobs: BlobRights;
  // Where a stored reply of an idempotent duplicate may have spilled (ADR 0135).
  files: SpillFiles;
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

// 03 §3.3 step 5 and 02 §2.13: at most 16 MB (over 256 KB it spills when stored, ADR 0135), then the manifest schema.
export function checkPayload(options: AdmissionOptions, schema: JsonObject | undefined, payload: Json): void {
  if (jsonByteLength(payload) > maxPayloadBytes) {
    throw new Refusal('PAYLOAD_TOO_LARGE', { params: { limit: 'payload', max: maxPayloadBytes }, hint: 'store large data as a blob and send its id' });
  }
  if (schema === undefined) return;
  const issues = options.validators.issues(schema, payload);
  if (issues.length > 0) throw new Refusal('VALIDATION_FAILED', { issues });
}

// 04 §4.6, ADR 0134: every z.blobId() field names a blob the sender may read.
export function checkBlobs(options: AdmissionOptions, sender: Sender, schema: JsonObject | undefined, payload: Json, received: ReadonlySet<string>): void {
  const blobId = options.blobs.unreadable(sender, schema, payload, received);
  if (blobId === undefined) return;
  throw new Refusal('CAPABILITY_DENIED', {
    detail: `the sender may not read the blob ${blobId}`, hint: 'name only blobs you hold a reference to or received in a z.blobId() field',
  });
}

export function refusalOf(error: unknown): Refusal {
  if (error instanceof Refusal) return error;
  throw error;
}
