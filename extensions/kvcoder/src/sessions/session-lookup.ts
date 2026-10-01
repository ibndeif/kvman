import { ProblemError, type Ctx, type Stored } from '@kvman/sdk';
import type { SessionDoc } from '../schemas/records.ts';
import { records } from '../store/collections.ts';

// Finding a session of the job's workspace (ADR 0009, 92 and 102).

/** The current time as kvcoder's records keep it. */
export const now = (): string => new Date().toISOString();

export async function findSession(ctx: Ctx, sessionId: string): Promise<Stored<SessionDoc>> {
  const session = await records(ctx.store).sessions.get(sessionId);
  if (session === undefined) throw ctx.problem('kvcoder/SESSION_NOT_FOUND', { sessionId });
  return session;
}

/** A session a command may change: a subagent session is for reading only. */
export async function ownSession(ctx: Ctx, sessionId: string): Promise<Stored<SessionDoc>> {
  const session = await findSession(ctx, sessionId);
  if (session.parentId !== null) {
    throw new ProblemError({ code: 'VALIDATION_FAILED', message: `The session ${sessionId} is a subagent's; it is read, cancelled, and deleted through its parent.`, params: { sessionId } });
  }
  return session;
}

/** Fails `NOT_PUBLIC` unless the person called (ADR 0009, 105). */
export function userOnly(ctx: Ctx, name: string): void {
  if (ctx.job.caller.kind !== 'user') throw new ProblemError({ code: 'NOT_PUBLIC', message: `${name} is for the person only.`, params: { name } });
}
