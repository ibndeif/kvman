import { addressSchema, commandRequestBodySchema, limits, type ReplyPayload } from '@kvman/protocol';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Sender } from '../../storage/commit-unit.ts';
import type { ReplyTarget } from '../events/event-hub.ts';
import type { RouteContext } from './http-adapter.ts';
import { sendProblem } from './problem-replies.ts';

// A command request waiting for its reply; shutdown releases it with 202 (ADR 0090).
export type WaitingCommand = { release(): void };

type Caller = { sender: Sender; late: ReplyTarget | undefined };

function header(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return typeof value === 'string' ? value : undefined;
}

// 12 §12.3: a shell tab names its stream and client; without the client header the source is user:local.
export function callerOf(request: FastifyRequest): Caller | undefined {
  const clientId = header(request, 'x-kvman-client');
  const streamId = header(request, 'x-kvman-stream');
  const address = addressSchema.safeParse(clientId === undefined ? 'user:local' : `user:local/client:${clientId}`);
  if (!address.success || streamId === '') return undefined;
  const late = streamId === undefined || clientId === undefined ? undefined : { streamId, clientId };
  return { sender: { address: address.data }, late };
}

function answerReply(reply: FastifyReply, id: string, payload: ReplyPayload): FastifyReply {
  if (!payload.ok) return sendProblem(reply, { ...payload.problem, messageId: payload.problem.messageId ?? id });
  return reply.code(200).send({ id, reply: payload.value });
}

type Wait = { context: RouteContext; reply: FastifyReply; id: string; waitMs: number; late: ReplyTarget | undefined };

// 12 §12.2–§12.3: the request waits for the reply up to `wait`. It answers 200 with the reply, or 202 when the
// handler defers, the wait passes, the client leaves, or the kernel shuts down; a later reply then goes to the tab's
// stream, if it named one. Both are decided in synchronous listener calls, so a reply goes to exactly one place.
function waitForReply({ context, reply, id, waitMs, late }: Wait): Promise<FastifyReply> {
  const { runtime, hub } = context.kernel();
  return new Promise((resolve) => {
    let answered = false;
    let timer: { cancel(): void } | undefined;
    let stopListening: () => void = () => undefined;
    const finish = (answer: () => FastifyReply): void => {
      if (answered) return;
      answered = true;
      timer?.cancel();
      context.waiting.delete(waiting);
      resolve(answer());
    };
    const accepted = (): void => finish(() => {
      if (late === undefined) stopListening();
      return reply.code(202).send({ id, state: runtime.messageStatus(id)?.state ?? 'pending' });
    });
    const waiting: WaitingCommand = { release: accepted };
    context.waiting.add(waiting);
    stopListening = runtime.listenForReply(id, {
      replied: (payload) => {
        if (!answered) finish(() => answerReply(reply, id, payload));
        else if (late !== undefined) hub.reply(late, id, payload);
      },
      deferred: accepted,
    });
    if (answered) return;
    timer = context.timers.set(waitMs, accepted);
    reply.raw.once('close', accepted);
  });
}

async function answerCommand(context: RouteContext, request: FastifyRequest<{ Params: { type: string } }>, reply: FastifyReply): Promise<FastifyReply> {
  const body = commandRequestBodySchema.safeParse(request.body);
  if (!body.success) return sendProblem(reply, context.problems.invalid('the request body does not match its schema', body.error.issues));
  const caller = callerOf(request);
  if (caller === undefined) return sendProblem(reply, context.problems.invalid('X-Kvman-Client or X-Kvman-Stream is not a valid name'));
  const { payload, workspaceId, lane, idempotencyKey, priority, wait } = body.data;
  const submission = await context.kernel().runtime.submitCommand({
    sender: caller.sender, type: request.params.type, payload, idempotencyKey,
    ...(workspaceId === undefined ? {} : { workspaceId }), ...(lane === undefined ? {} : { lane }), ...(priority === undefined ? {} : { priority }),
  });
  if (!submission.ok) return sendProblem(reply, submission.problem);
  const { id, state } = submission;
  if (submission.reply !== undefined) return answerReply(reply, id, submission.reply);
  if (state === 'awaiting' || wait === 0) return reply.code(202).send({ id, state });
  return waitForReply({ context, reply, id, waitMs: wait ?? limits.maxCommandWaitMs, late: caller.late });
}

export function registerCommandRoutes(app: FastifyInstance, context: RouteContext): void {
  app.post<{ Params: { type: string } }>('/api/v1/commands/:type', (request, reply) => answerCommand(context, request, reply));
}
