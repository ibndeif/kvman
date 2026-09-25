import { queryRequestBodySchema, ulidSchema } from '@kvman/protocol';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { callerOf } from './command-routes.ts';
import type { RouteContext } from './http-adapter.ts';
import { sendProblem } from './problem-replies.ts';

// 12 §12.2: a query answers its data in the same response; it is never stored.
async function answerQuery(context: RouteContext, request: FastifyRequest<{ Params: { type: string } }>, reply: FastifyReply): Promise<FastifyReply> {
  const body = queryRequestBodySchema.safeParse(request.body);
  if (!body.success) return sendProblem(reply, context.problems.invalid('the request body does not match its schema', body.error.issues));
  const caller = callerOf(request);
  if (caller === undefined) return sendProblem(reply, context.problems.invalid('X-Kvman-Client or X-Kvman-Stream is not a valid name'));
  const answer = await context.kernel().runtime.query({
    sender: caller.sender, type: request.params.type, payload: body.data.payload, cause: undefined, workspaceId: body.data.workspaceId,
  });
  return answer.ok ? reply.code(200).send({ data: answer.value }) : sendProblem(reply, answer.problem);
}

// A caller whose request ended reads its reply here (02 §2.8, ADR 0066).
function answerMessage(context: RouteContext, request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply): FastifyReply {
  const id = ulidSchema.safeParse(request.params.id);
  if (!id.success) return sendProblem(reply, context.problems.invalid('the message id is not a ULID', id.error.issues));
  const status = context.kernel().runtime.messageStatus(id.data);
  return status === undefined ? sendProblem(reply, context.problems.refused('NOT_FOUND', `no message ${id.data}`)) : reply.code(200).send(status);
}

export function registerReadRoutes(app: FastifyInstance, context: RouteContext): void {
  app.post<{ Params: { type: string } }>('/api/v1/queries/:type', (request, reply) => answerQuery(context, request, reply));
  app.get<{ Params: { id: string } }>('/api/v1/messages/:id', (request, reply) => answerMessage(context, request, reply));
  app.get('/api/v1/health', (_request, reply) => reply.code(200).send(context.kernel().runtime.health()));
}
