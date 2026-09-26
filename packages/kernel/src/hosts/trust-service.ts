import {
  trustGrantRequestSchema, trustLimits, trustPreviewRequestSchema, trustRevokeRequestSchema, type Message, type Problem, type TrustedFile,
} from '@kvman/protocol';
import type { GrantsSource } from '../router/grants.ts';
import type { Claim } from '../scheduler/dispatcher.ts';
import type { CommitPipeline } from '../storage/commit-pipeline.ts';
import type { Connection } from '../storage/driver.ts';
import { readTrust, type TrustChange } from '../storage/trust-changes.ts';
import type { UlidGenerator } from '../ulid.ts';
import type { GateFolder, TrustGate } from '../workspaces/trust-gate.ts';
import { TrustTooLarge, UntrustableEntry } from '../workspaces/trust-scan.ts';
import { filesDigest, type TrustTokens } from '../workspaces/trust-tokens.ts';
import { isAdministrator } from './administrators.ts';
import { parsed, refusal } from './command-payloads.ts';
import type { KernelCommits } from './kernel-commits.ts';
import type { QueryAnswer } from './query-path.ts';
import { readWorkspace } from './workspace-rows.ts';

export type TrustServiceDeps = {
  connection: Connection;
  pipeline: CommitPipeline;
  commits: KernelCommits;
  grants: GrantsSource;
  gate: TrustGate;
  tokens: TrustTokens;
  ids: UlidGenerator;
};

type Preview = { ok: true; files: TrustedFile[] } | { ok: false; problem: Problem };

// 07 §7.2, 03 §3.8, ADR 0137: kernel.trust.preview, grant, and revoke, and the gate the workspace I/O edge asks.
export class TrustService {
  readonly #deps: TrustServiceDeps;

  constructor(deps: TrustServiceDeps) {
    this.#deps = deps;
  }

  async preview(message: Message): Promise<QueryAnswer> {
    const request = parsed(trustPreviewRequestSchema, message);
    if (!request.ok) return request;
    const folder = this.#folder(request.value.workspaceId);
    if (folder === undefined) return { ok: false, problem: refusal(message, 'WORKSPACE_INVALID', { detail: `no workspace ${request.value.workspaceId} exists` }) };
    const preview = await this.#preview(message, folder);
    if (!preview.ok) return preview;
    return { ok: true, value: { files: preview.files, confirmationToken: this.#deps.tokens.issue(folder.id, preview.files) } };
  }

  // The files are previewed again: a token for files that changed since is as expired as an old one.
  async grant(claim: Claim): Promise<void> {
    const { message } = claim;
    const request = parsed(trustGrantRequestSchema, message);
    if (!request.ok) return this.#deps.commits.fail(claim, request.problem);
    const claims = this.#deps.tokens.verify(request.value.confirmationToken);
    const folder = claims === undefined ? undefined : this.#folder(claims.workspaceId);
    const preview = folder === undefined ? undefined : await this.#preview(message, folder);
    if (claims === undefined || folder === undefined || preview === undefined || !preview.ok || filesDigest(preview.files) !== claims.digest) {
      return this.#deps.commits.fail(claim, refusal(message, 'CONFIRMATION_EXPIRED', { detail: 'the preview expired or its files changed', hint: 'preview the workspace again' }));
    }
    await this.#change(claim, { kind: 'trust.grant', workspaceId: folder.id, trust: { mode: request.value.mode, files: preview.files } });
  }

  async revoke(claim: Claim): Promise<void> {
    const { message } = claim;
    if (!isAdministrator(this.#deps.grants, message)) {
      return this.#deps.commits.fail(claim, refusal(message, 'CAPABILITY_DENIED', { detail: `${message.source} may not send ${message.type}`, hint: 'request kernel.admin' }));
    }
    const request = parsed(trustRevokeRequestSchema, message);
    if (!request.ok) return this.#deps.commits.fail(claim, request.problem);
    this.#deps.gate.forget(request.value.workspaceId);
    await this.#change(claim, { kind: 'trust.revoke', workspaceId: request.value.workspaceId });
  }

  // Whether the gate is open for a workspace: a stored record whose files are unchanged. A record whose files
  // changed is cleared, and kernel.trust.changed is published once.
  async open(folder: GateFolder): Promise<boolean> {
    const trust = readTrust(this.#deps.connection, folder.id);
    if (trust === undefined) return false;
    if (await this.#deps.gate.intact(folder, trust)) return true;
    await this.close(folder.id);
    return false;
  }

  // 07 §7.2 step 4: a write under .kvman/ closes the gate, whoever wrote it.
  async close(workspaceId: string): Promise<void> {
    this.#deps.gate.forget(workspaceId);
    const change: TrustChange = { kind: 'trust.close', workspaceId };
    await this.#deps.pipeline.enqueue({ origin: { kind: 'change', change, correlationId: this.#deps.ids.next() }, writes: [], sends: [], publishes: [], replies: [] });
  }

  async #preview(message: Message, folder: GateFolder): Promise<Preview> {
    try {
      return { ok: true, files: await this.#deps.gate.preview(folder) };
    } catch (error) {
      if (error instanceof UntrustableEntry) {
        return { ok: false, problem: refusal(message, 'WORKSPACE_UNTRUSTED', { detail: error.message, hint: `remove ${error.path} or replace it with a regular file, then preview again` }) };
      }
      if (error instanceof TrustTooLarge) {
        return { ok: false, problem: refusal(message, 'PAYLOAD_TOO_LARGE', { detail: error.message, params: { limit: 'trust', max: error.max }, hint: `keep at most ${trustLimits.files} files and ${trustLimits.bytes} bytes under .kvman/` }) };
      }
      throw error;
    }
  }

  #folder(workspaceId: string): GateFolder | undefined {
    const workspace = readWorkspace(this.#deps.connection, workspaceId);
    return workspace === undefined ? undefined : { id: workspace.id, path: workspace.path };
  }

  async #change(claim: Claim, change: TrustChange): Promise<void> {
    const { message } = claim;
    await this.#deps.commits.commit({ origin: { kind: 'change', change, command: message, correlationId: message.correlationId }, writes: [], sends: [], publishes: [], replies: [] }, claim);
  }
}
