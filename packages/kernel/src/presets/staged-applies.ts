import { randomBytes } from 'node:crypto';
import type { Preset } from '@kvman/protocol';
import type { InstallService } from '../install/install-service.ts';
import { stageTokenLifetimeMs } from '../install/staged-versions.ts';
import type { ResolvedVersion } from './version-resolution.ts';

export type StagedApply = {
  workspaceId: string;
  preset: Preset;
  importing: boolean;
  versions: ResolvedVersion[];
  expiresAt: number;
};

export type StagedAppliesDeps = { install: InstallService; now: () => number };

// 07 §7.4, ADR 0148: the staged applies of kernel.preset.apply.stage, held with their staged trees for 10 minutes and
// dropped when the token expires, is used, or the reply does not commit. One instance per runtime.
export class StagedApplies {
  readonly #install: InstallService;
  readonly #now: () => number;
  readonly #entries = new Map<string, StagedApply>();

  constructor(deps: StagedAppliesDeps) {
    this.#install = deps.install;
    this.#now = deps.now;
  }

  add(entry: Omit<StagedApply, 'expiresAt'>): { confirmationToken: string; expiresAt: number } {
    const confirmationToken = randomBytes(24).toString('base64url');
    const expiresAt = this.#now() + stageTokenLifetimeMs;
    this.#entries.set(confirmationToken, { ...entry, expiresAt });
    return { confirmationToken, expiresAt };
  }

  // The staged apply of a live token, which the call consumes; an unknown, used, or expired token has none.
  async take(confirmationToken: string): Promise<StagedApply | undefined> {
    await this.purgeExpired();
    const entry = this.#entries.get(confirmationToken);
    this.#entries.delete(confirmationToken);
    return entry;
  }

  async purgeExpired(): Promise<void> {
    const now = this.#now();
    for (const [token, entry] of [...this.#entries]) {
      if (entry.expiresAt > now) continue;
      this.#entries.delete(token);
      await this.#removeTrees(entry);
    }
  }

  // A staged apply whose token was issued and whose reply did not commit is dropped with its trees.
  async discard(confirmationToken: string): Promise<void> {
    const entry = await this.take(confirmationToken);
    if (entry !== undefined) await this.#removeTrees(entry);
  }

  async #removeTrees(entry: StagedApply): Promise<void> {
    for (const version of entry.versions) {
      if (version.staged !== undefined) await this.#install.discardStaged(version.staged);
    }
  }
}
