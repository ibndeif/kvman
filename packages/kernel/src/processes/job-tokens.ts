import { createHash, randomBytes } from 'node:crypto';
import type { Message } from '@kvman/protocol';
import type { DelegatingActor, Sender } from '../storage/commit-unit.ts';

// What a token lets its process do (12 §12.4, ADR 0140): call the types its patterns match, as `proc:<processId>`,
// with the grants of the spawner or of the actor it delegates, chained under the spawning message.
export type TokenGrant = {
  processId: string;
  spawner: string;
  cause: Message;
  calls: readonly string[];
  context: Record<string, string>;
  delegatedBy: DelegatingActor | undefined;
};

function keyOf(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function tokenSender(grant: TokenGrant): Sender {
  return {
    address: `proc:${grant.processId}`, extension: grant.spawner, ...(grant.delegatedBy === undefined ? {} : { delegatedBy: grant.delegatedBy }),
  };
}

// Tokens live only in memory, keyed by their SHA-256; a restart kills every process, so none outlives the kernel.
export class JobTokens {
  readonly #grants = new Map<string, TokenGrant>();
  readonly #keys = new Map<string, string>();

  issue(grant: TokenGrant): string {
    const token = randomBytes(32).toString('base64url');
    const key = keyOf(token);
    this.#grants.set(key, grant);
    this.#keys.set(grant.processId, key);
    return token;
  }

  resolve(token: string): TokenGrant | undefined {
    return this.#grants.get(keyOf(token));
  }

  // The actor a process delegates when it spawns with `delegate` itself: its own actor while its token lives.
  actorOf(processId: string): DelegatingActor | undefined {
    const key = this.#keys.get(processId);
    const grant = key === undefined ? undefined : this.#grants.get(key);
    if (grant === undefined) return undefined;
    return grant.delegatedBy ?? { kind: 'extension', extension: grant.spawner };
  }

  revoke(processId: string): void {
    const key = this.#keys.get(processId);
    if (key === undefined) return;
    this.#keys.delete(processId);
    this.#grants.delete(key);
  }
}
