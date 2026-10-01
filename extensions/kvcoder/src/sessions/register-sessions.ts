import { z, type Ctx } from '@kvman/sdk';
import { sessionTools } from '../prompt/session-prompt.ts';
import { firePoint } from '../registry/session-points.ts';
import { readSettings } from '../register-settings.ts';
import { statusSchema, thinkingSchema } from '../schemas/records.ts';
import { records } from '../store/collections.ts';
import { cancelTurn } from '../turns/cancel-turn.ts';
import { compact } from '../turns/compaction.ts';
import { deleteSessionTree, newSession } from './new-session.ts';
import { findSession, now, ownSession } from './session-lookup.ts';
import { sessionSchema, sessionView } from './session-view.ts';

// Sessions (plan 08 §8.6). A subagent session is for reading: commands that change one fail (ADR 0009, 102).

const sessionIdSchema = z.object({ sessionId: z.string() });

export function registerSessions(ctx: Ctx): void {
  ctx.registerCommand('kvcoder.session.create', {
    description: 'Creates a session in this workspace.',
    input: z.object({ title: z.string().min(1).exactOptional() }),
    output: sessionSchema,
    public: true,
    handle: async ({ title }) => sessionView(await newSession(ctx, title)),
  });
  ctx.registerQuery('kvcoder.session.list', {
    description: "Lists this workspace's top-level sessions, newest first.",
    input: z.object({ limit: z.number().int().positive().max(1000) }),
    output: z.array(sessionSchema),
    public: true,
    handle: async ({ limit }) => (await records(ctx.store).sessions.find({ parentId: null }, { limit, order: 'desc' })).map(sessionView),
  });
  ctx.registerQuery('kvcoder.session.count', {
    description: "Counts this workspace's top-level sessions, of one status or all.",
    input: z.object({ status: statusSchema.exactOptional() }),
    output: z.object({ count: z.number().int() }),
    public: true,
    handle: async ({ status }) => ({ count: await records(ctx.store).sessions.count(status === undefined ? { parentId: null } : { parentId: null, status }) }),
  });
  ctx.registerQuery('kvcoder.session.get', {
    description: 'Gives a session.',
    input: sessionIdSchema,
    output: sessionSchema,
    public: true,
    handle: async ({ sessionId }) => sessionView(await findSession(ctx, sessionId)),
  });
  ctx.registerCommand('kvcoder.session.rename', {
    description: 'Renames a session; kvcoder never retitles it after that.',
    input: z.object({ sessionId: z.string(), title: z.string().min(1) }),
    output: z.object({}),
    public: true,
    handle: async ({ sessionId, title }) => {
      await ownSession(ctx, sessionId);
      await records(ctx.store).sessions.update(sessionId, { title, autoTitle: false, updatedAt: now() });
      return {};
    },
  });
  ctx.registerCommand('kvcoder.session.configure', {
    description: "Changes a session's model or thinking level, from its next step.",
    input: z.object({ sessionId: z.string(), model: z.string().min(1).exactOptional(), thinking: thinkingSchema.exactOptional() }),
    output: z.object({}),
    public: true,
    handle: async ({ sessionId, model, thinking }) => {
      await ownSession(ctx, sessionId);
      await records(ctx.store).sessions.update(sessionId, { ...(model === undefined ? {} : { model }), ...(thinking === undefined ? {} : { thinking }), updatedAt: now() });
      return {};
    },
  });
  ctx.registerCommand('kvcoder.session.delete', {
    description: 'Deletes a session: cancels its turn and deletes its subagent sessions.',
    input: sessionIdSchema,
    output: z.object({}),
    public: true,
    handle: async ({ sessionId }) => {
      await ownSession(ctx, sessionId);
      await cancelTurn(ctx, sessionId, false);
      await deleteSessionTree(ctx, sessionId);
      await firePoint(ctx, 'kvcoder.session.deleted', { sessionId });
      return {};
    },
  });
  ctx.registerCommand('kvcoder.session.compact', {
    description: "Summarizes a session's older messages now; the last 10 stay whole.",
    input: sessionIdSchema,
    output: z.object({}),
    public: true,
    handle: async ({ sessionId }) => {
      const session = await ownSession(ctx, sessionId);
      if (session.status === 'running') throw ctx.problem('kvcoder/SESSION_BUSY', { sessionId });
      const tools = await sessionTools(ctx, session);
      await compact(ctx, session, { force: true, compactAt: (await readSettings(ctx)).compactAt, prompt: tools.built.prompt, turnId: null });
      return {};
    },
  });
}
