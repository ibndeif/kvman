import { rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { StageResult } from '@kvman/protocol';
import type { ExtensionVersion } from '../storage/extension-changes.ts';
import { InstallFailure } from './install-failure.ts';
import { snapshotFolder, StagingArea, type InstallPaths } from './install-paths.ts';
import type { InstallLoader } from './loader-process.ts';
import { placeSnapshot } from './snapshot-placement.ts';
import { resolveFolder, resolveSource, type SourceTools } from './sources.ts';
import { stageTree, type StageTools } from './stage-pipeline.ts';
import { stageSummary, type StagedVersion } from './stage-summary.ts';
import { StagedVersions } from './staged-versions.ts';
import type { KernelEvents } from '../validation/reference-rules.ts';

export type InstallServiceOptions = Omit<SourceTools, 'signal'> & {
  loader: InstallLoader;
  sdkVersion: string;
  kernelEvents: KernelEvents;
  now: () => number;
};

// The install pipeline of 06 §6.2 behind the kernel's stage and install commands: staging trees, confirmation
// tokens, and snapshots.
export class InstallService {
  readonly paths: InstallPaths;
  readonly #options: InstallServiceOptions;
  readonly #area: StagingArea;
  readonly #staged: StagedVersions;

  constructor(options: InstallServiceOptions) {
    this.#options = options;
    this.paths = options.paths;
    this.#area = new StagingArea(options.paths.staging);
    this.#staged = new StagedVersions(this.#area, options.now);
  }

  // 06 §6.2: interrupted staging trees are deleted at boot.
  clearStaging(): Promise<void> {
    return this.#area.clear();
  }

  async stage(source: string, correlationId: string, signal: AbortSignal): Promise<StageResult> {
    await this.#staged.purgeExpired();
    const staged = await stageTree(source, (folders) => resolveSource(source, folders, { ...this.#options, signal }), this.#stageTools(correlationId));
    return { ...stageSummary(staged), ...this.#staged.add(staged) };
  }

  // The dev folder pipeline (ADR 0116), which kernel.dev.folder.stage and kernel.dev.build will call with their
  // recorded `dev:` source.
  stageFolder(folder: string, source: string, correlationId: string, signal: AbortSignal): Promise<StagedVersion> {
    return stageTree(source, (folders) => resolveFolder(folder, folders, { ...this.#options, signal }), this.#stageTools(correlationId));
  }

  // A staged version whose token was issued and whose reply did not commit is dropped with its tree.
  async discard(confirmationToken: string): Promise<void> {
    const staged = await this.#staged.take(confirmationToken);
    if (staged !== undefined) await this.#area.remove(dirname(staged.tree));
  }

  // 06 §6.2 steps 6–7: a live token's tree, re-verified against its digest and moved into snapshots/.
  async confirm(confirmationToken: string): Promise<ExtensionVersion> {
    const staged = await this.#staged.take(confirmationToken);
    if (staged === undefined) throw new InstallFailure('CONFIRMATION_EXPIRED', { detail: 'the confirmation expired or was already used', hint: 'stage the extension again' });
    const digest = await placeSnapshot(this.paths, staged.tree, staged.manifest, staged.digest);
    if (digest === undefined) throw new InstallFailure('CONFIRMATION_EXPIRED', { detail: 'the staged files changed after staging', hint: 'stage the extension again' });
    const { manifest, source, integrity } = staged;
    return { name: manifest.meta.name, digest, source, manifest, installedAt: this.#options.now(), ...(integrity === undefined ? {} : { integrity }) };
  }

  async removeSnapshots(digests: readonly string[]): Promise<void> {
    for (const digest of digests) await rm(snapshotFolder(this.paths, digest), { recursive: true, force: true });
  }

  #stageTools(correlationId: string): StageTools {
    const { loader, sdkVersion, kernelEvents } = this.#options;
    return { area: this.#area, loader, sdkVersion, kernelEvents, correlationId };
  }
}
