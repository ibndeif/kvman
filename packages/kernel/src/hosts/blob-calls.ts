import { blobLimits, type Json, type KernelErrorCode, type Problem, type RpcResult, type StoreScope } from '@kvman/protocol';
import { BlobTooLarge, type BlobIntake } from '../blobs/blob-intake.ts';
import type { BlobRights } from '../blobs/blob-rights.ts';
import { blobLifetimes, blobRefNames, type BlobHolder } from '../blobs/blob-rows.ts';
import type { BlobMeta, BlobStore } from '../blobs/blob-store.ts';
import { kernelProblem, type ProblemContext } from '../problems.ts';
import { StorageFailure } from '../storage/driver.ts';
import { storageProblem } from '../storage/unit-application.ts';
import { copyFile, errnoCode } from '../workspaces/workspace-io.ts';
import { extensionSender, type ActiveInvocation } from './active-invocation.ts';
import type { ServiceCall } from './invocation-sink.ts';
import type { WorkspaceCalls } from './workspace-calls.ts';

export type BlobCall = Extract<ServiceCall, { name: `blobs.${string}` }>;

export type BlobCallsDeps = { store: BlobStore; rights: BlobRights; files: WorkspaceCalls };

type PutCall = Extract<BlobCall, { name: 'blobs.put.close' | 'blobs.put.file' }>;

const defaultMime = 'application/octet-stream';

// 04 §4.3, §4.6, ADR 0134: ctx.store.blobs at the kernel. A put streams into an upload the kernel opened for the
// running message and registers with a pending reference; reads need the right to read the blob.
export class BlobCalls {
  readonly #deps: BlobCallsDeps;
  readonly #uploads = new Map<string, Map<number, BlobIntake>>();
  #nextUpload = 1;

  constructor(deps: BlobCallsDeps) {
    this.#deps = deps;
  }

  async handle(invocation: ActiveInvocation, call: BlobCall): Promise<RpcResult> {
    switch (call.name) {
      case 'blobs.put.open':
        return this.#open(invocation);
      case 'blobs.put.write':
        return this.#write(invocation, call.upload, Buffer.from(call.bytes, 'base64'));
      case 'blobs.put.close':
        return this.#close(invocation, call);
      case 'blobs.put.file':
        return this.#file(invocation, call);
      case 'blobs.stat':
        return this.#stat(invocation, call.blobId);
      case 'blobs.read':
        return this.#read(invocation, call.blobId, call.offset, call.length);
    }
  }

  // The message's attempt ended: uploads it left open are dropped with their temporary files.
  async ended(messageId: string): Promise<void> {
    const uploads = this.#uploads.get(messageId);
    this.#uploads.delete(messageId);
    await Promise.all([...(uploads?.values() ?? [])].map((intake) => intake.discard()));
  }

  async #open(invocation: ActiveInvocation): Promise<RpcResult> {
    const upload = this.#nextUpload;
    this.#nextUpload += 1;
    const uploads = this.#uploads.get(invocation.claim.message.id) ?? new Map<number, BlobIntake>();
    this.#uploads.set(invocation.claim.message.id, uploads);
    uploads.set(upload, await this.#deps.store.intake());
    return { ok: true, value: { upload } };
  }

  async #write(invocation: ActiveInvocation, upload: number, bytes: Buffer): Promise<RpcResult> {
    const intake = this.#uploads.get(invocation.claim.message.id)?.get(upload);
    if (intake === undefined) return this.#refused(invocation, 'VALIDATION_FAILED', { detail: `no upload ${upload} is open` });
    try {
      await intake.write(bytes);
      return { ok: true };
    } catch (error) {
      if (!(error instanceof BlobTooLarge)) throw error;
      this.#uploads.get(invocation.claim.message.id)?.delete(upload);
      await intake.discard();
      return this.#tooLarge(invocation);
    }
  }

  async #close(invocation: ActiveInvocation, call: Extract<PutCall, { name: 'blobs.put.close' }>): Promise<RpcResult> {
    const uploads = this.#uploads.get(invocation.claim.message.id);
    const intake = uploads?.get(call.upload);
    if (intake === undefined) return this.#refused(invocation, 'VALIDATION_FAILED', { detail: `no upload ${call.upload} is open` });
    uploads?.delete(call.upload);
    return this.#register(invocation, intake, call);
  }

  async #file(invocation: ActiveInvocation, call: Extract<PutCall, { name: 'blobs.put.file' }>): Promise<RpcResult> {
    const file = await this.#deps.files.readable(invocation, call.path);
    if (!file.ok) return { ok: false, problem: file.problem };
    const intake = await this.#deps.store.intake();
    try {
      await copyFile(file.real, blobLimits.chunkBytes, (bytes) => intake.write(bytes));
    } catch (error) {
      await intake.discard();
      if (error instanceof BlobTooLarge) return this.#tooLarge(invocation);
      return this.#refused(invocation, errnoCode(error), { detail: 'the workspace file could not be read' });
    }
    return this.#register(invocation, intake, call);
  }

  async #register(invocation: ActiveInvocation, intake: BlobIntake, call: PutCall): Promise<RpcResult> {
    const holder = this.#holder(invocation, call.scope);
    if (holder === undefined) {
      await intake.discard();
      return this.#refused(invocation, 'WORKSPACE_INVALID', { detail: 'this handler has no workspace', hint: 'use ctx.store.global.blobs' });
    }
    const meta: BlobMeta = { mime: call.mime ?? defaultMime, ...(call.fileName === undefined ? {} : { name: call.fileName }) };
    try {
      const info = this.#deps.store.register(await intake.finish(), meta, holder);
      return { ok: true, value: info satisfies Json };
    } catch (error) {
      if (!(error instanceof StorageFailure)) throw error;
      return { ok: false, problem: storageProblem(error, invocation.claim.message.correlationId) };
    }
  }

  #holder(invocation: ActiveInvocation, scope: StoreScope): BlobHolder | undefined {
    const { message, extension, deadlineAt } = invocation.claim;
    const ws = scope === 'global' ? '' : message.workspaceId;
    if (ws === undefined) return undefined;
    return { owner: extension, ws, ref: blobRefNames.pending(message.id), expiresAt: deadlineAt + blobLifetimes.pendingGraceMs };
  }

  #stat(invocation: ActiveInvocation, blobId: string): RpcResult {
    if (!this.#mayRead(invocation, blobId)) return this.#denied(invocation, blobId);
    const stat = this.#deps.store.stat(blobId);
    return stat === undefined ? { ok: true } : { ok: true, value: stat };
  }

  async #read(invocation: ActiveInvocation, blobId: string, offset: number, length: number): Promise<RpcResult> {
    if (!this.#mayRead(invocation, blobId)) return this.#denied(invocation, blobId);
    if (this.#deps.store.stat(blobId) === undefined) return this.#refused(invocation, 'BLOB_NOT_FOUND', { detail: `no blob ${blobId} exists` });
    const bytes = await this.#deps.store.read(blobId, offset, length);
    return { ok: true, value: { bytes: bytes.toString('base64') } };
  }

  #mayRead(invocation: ActiveInvocation, blobId: string): boolean {
    return this.#deps.rights.mayRead(extensionSender(invocation), blobId, invocation.received);
  }

  #denied(invocation: ActiveInvocation, blobId: string): RpcResult {
    return this.#refused(invocation, 'CAPABILITY_DENIED', {
      detail: `${invocation.claim.extension} may not read the blob ${blobId}`, hint: 'keep the blob, or receive it in a z.blobId() field',
    });
  }

  #tooLarge(invocation: ActiveInvocation): RpcResult {
    return this.#refused(invocation, 'BLOB_TOO_LARGE', { params: { max: blobLimits.putBytes }, hint: 'store at most 100 MB in one blob' });
  }

  #refused(invocation: ActiveInvocation, code: KernelErrorCode, context: Omit<ProblemContext, 'correlationId' | 'messageId'>): RpcResult {
    const { message } = invocation.claim;
    const problem: Problem = kernelProblem(code, { correlationId: message.correlationId, messageId: message.id, ...context });
    return { ok: false, problem };
  }
}
