import { randomBytes } from 'node:crypto';
import { dirname } from 'node:path';
import type { StagedVersion } from './stage-summary.ts';
import type { StagingArea } from './install-paths.ts';

// 03 §3.8: a stage token expires after 10 minutes.
export const stageTokenLifetimeMs = 10 * 60_000;

type Entry = { staged: StagedVersion; expiresAt: number };

// The confirmation tokens of staged versions (ADR 0118): kept in memory with their staged trees, used once, and
// gone after 10 minutes or a restart (boot clears the staging folder).
export class StagedVersions {
  readonly #area: StagingArea;
  readonly #now: () => number;
  readonly #entries = new Map<string, Entry>();

  constructor(area: StagingArea, now: () => number) {
    this.#area = area;
    this.#now = now;
  }

  add(staged: StagedVersion): { confirmationToken: string; expiresAt: number } {
    const confirmationToken = randomBytes(24).toString('base64url');
    const expiresAt = this.#now() + stageTokenLifetimeMs;
    this.#entries.set(confirmationToken, { staged, expiresAt });
    return { confirmationToken, expiresAt };
  }

  // The staged version of a live token, which the call consumes; an unknown, used, or expired token has none.
  async take(confirmationToken: string): Promise<StagedVersion | undefined> {
    await this.purgeExpired();
    const entry = this.#entries.get(confirmationToken);
    this.#entries.delete(confirmationToken);
    return entry?.staged;
  }

  async purgeExpired(): Promise<void> {
    const now = this.#now();
    for (const [token, entry] of [...this.#entries]) {
      if (entry.expiresAt > now) continue;
      this.#entries.delete(token);
      await this.#area.remove(dirname(entry.staged.tree));
    }
  }
}
