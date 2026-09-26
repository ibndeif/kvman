import { realpathSync } from 'node:fs';
import type { BlobInfo } from '@kvman/protocol';
import { BlobCollector } from '../blobs/blob-collector.ts';
import { BlobFiles } from '../blobs/blob-files.ts';
import type { TakenBlob } from '../blobs/blob-intake.ts';
import { BlobRights } from '../blobs/blob-rights.ts';
import { blobLifetimes, blobRefNames } from '../blobs/blob-rows.ts';
import { BlobStore, type BlobMeta } from '../blobs/blob-store.ts';
import type { FaultPoints } from '../faults/fault-points.ts';
import { BlobCalls } from '../hosts/blob-calls.ts';
import type { KernelCommits } from '../hosts/kernel-commits.ts';
import type { KernelLogger } from '../hosts/kernel-logger.ts';
import { TrustService } from '../hosts/trust-service.ts';
import { WorkspaceCalls } from '../hosts/workspace-calls.ts';
import type { GrantsSource } from '../router/grants.ts';
import type { SchedulerTimers } from '../scheduler/timers.ts';
import type { CommitPipeline } from '../storage/commit-pipeline.ts';
import type { Connection } from '../storage/driver.ts';
import type { UlidGenerator } from '../ulid.ts';
import { TrustGate } from '../workspaces/trust-gate.ts';
import { TrustTokens } from '../workspaces/trust-tokens.ts';

export type FileServicesDeps = {
  home: string;
  connection: Connection;
  now: () => number;
  timers: SchedulerTimers;
  ids: UlidGenerator;
  logger: KernelLogger;
  faults: FaultPoints;
};

// The pieces that need the commit pipeline and the kernel commits, which exist only after the router.
export type FileServiceLinks = { pipeline: CommitPipeline; commits: KernelCommits; grants: GrantsSource };

type LinkedServices = { trust: TrustService; blobCalls: BlobCalls; workspaceCalls: WorkspaceCalls };

// 04 §4.6, 07 §7.2: the blob store with its read rights and GC, and the workspace I/O edge with the trust gate.
export class FileServices {
  readonly files: BlobFiles;
  readonly store: BlobStore;
  readonly rights: BlobRights;
  readonly collector: BlobCollector;
  readonly #deps: FileServicesDeps;
  #linked: LinkedServices | undefined;

  constructor(deps: FileServicesDeps) {
    this.#deps = deps;
    this.files = new BlobFiles(deps.home);
    this.store = new BlobStore({ connection: deps.connection, files: this.files, now: deps.now, faults: deps.faults });
    this.rights = new BlobRights(deps.connection, deps.now);
    this.collector = new BlobCollector(this.store, deps.timers, (error) => deps.logger.write({
      level: 'error', message: 'blob GC failed', fields: { error: error instanceof Error ? error.name : 'unknown' }, attributes: { correlationId: deps.ids.next() },
    }));
  }

  link(links: FileServiceLinks): void {
    const { connection, ids, now, home } = this.#deps;
    const trust = new TrustService({ connection, pipeline: links.pipeline, commits: links.commits, grants: links.grants, gate: new TrustGate(), tokens: new TrustTokens(now), ids });
    const workspaceCalls = new WorkspaceCalls({ connection, grants: links.grants, trust, home: realpathSync.native(home) });
    this.#linked = { trust, workspaceCalls, blobCalls: new BlobCalls({ store: this.store, rights: this.rights, files: workspaceCalls }) };
  }

  get trust(): TrustService {
    return this.#linkedParts().trust;
  }

  get blobCalls(): BlobCalls {
    return this.#linkedParts().blobCalls;
  }

  get workspaceCalls(): WorkspaceCalls {
    return this.#linkedParts().workspaceCalls;
  }

  // PUT /blobs (04 §4.6, ADR 0138): a reference owned by the person, in the named workspace or global, for 24 h.
  upload(taken: TakenBlob, meta: BlobMeta, workspaceId: string | undefined): BlobInfo {
    const holder = { owner: 'user', ws: workspaceId ?? '', ref: blobRefNames.upload, expiresAt: this.#deps.now() + blobLifetimes.uploadMs };
    return this.store.register(taken, meta, holder);
  }

  // An attempt ended: its open uploads go, and without a commit its pending references too (04 §4.6).
  async ended(messageId: string, committed: boolean): Promise<void> {
    if (!committed) this.store.dropPending(messageId);
    await this.blobCalls.ended(messageId);
  }

  #linkedParts(): LinkedServices {
    if (this.#linked === undefined) throw new Error('the file services are not linked to the commit pipeline');
    return this.#linked;
  }
}
