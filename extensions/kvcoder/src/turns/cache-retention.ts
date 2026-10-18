import type { SessionDoc } from '../schemas/records.ts';

// The lead of a chat waits on the person, approvals, background runs, and helpers for longer than a provider's short
// prompt cache, so its calls ask for the long one; a helper's calls run back to back and keep the default (ADR 0087, 4).

/** The `cacheRetention` a session's step and summary calls send, spread into `kvai.complete`'s input. */
export function cacheRetentionOf(session: Pick<SessionDoc, 'parentId'>): { cacheRetention?: 'long' } {
  return session.parentId === null ? { cacheRetention: 'long' } : {};
}
