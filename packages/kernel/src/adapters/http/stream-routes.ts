import { subscriptionRequestBodySchema } from '@kvman/protocol';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { RouteContext } from './http-adapter.ts';
import { sendProblem } from './problem-replies.ts';

type StreamQuery = { stream?: string; lastEventId?: string };

const cursorPattern = /^\d+$/;

function header(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return typeof value === 'string' ? value : undefined;
}

// 12 §12.3: one event stream per browser; `Last-Event-ID` (or `?lastEventId=` from a new stream holder) resumes it.
function openStream(context: RouteContext, request: FastifyRequest<{ Querystring: StreamQuery }>, reply: FastifyReply): FastifyReply | undefined {
  const streamId = request.query.stream;
  if (streamId === undefined || streamId === '') return sendProblem(reply, context.problems.invalid('the stream parameter is required'));
  const cursorText = header(request, 'last-event-id') ?? request.query.lastEventId;
  if (cursorText !== undefined && !cursorPattern.test(cursorText)) return sendProblem(reply, context.problems.invalid('Last-Event-ID is not an event seq'));
  reply.hijack();
  const response = reply.raw;
  response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive' });
  const { hub } = context.kernel();
  const writer = hub.connect(streamId, response, cursorText === undefined ? undefined : Number(cursorText));
  response.once('close', () => hub.disconnect(streamId, writer));
  return undefined;
}

function subscribe(context: RouteContext, request: FastifyRequest, reply: FastifyReply): FastifyReply {
  const body = subscriptionRequestBodySchema.safeParse(request.body);
  if (!body.success) return sendProblem(reply, context.problems.invalid('the subscription does not match its schema', body.error.issues));
  if (context.kernel().hub.subscribe(body.data) === 'not-connected') {
    return sendProblem(reply, context.problems.refused('NOT_FOUND', `the stream ${body.data.stream} is not connected`));
  }
  return reply.code(201).send({ sid: body.data.sid });
}

function unsubscribe(context: RouteContext, request: FastifyRequest<{ Params: { sid: string }; Querystring: StreamQuery }>, reply: FastifyReply): FastifyReply {
  const streamId = request.query.stream;
  if (streamId === undefined || streamId === '') return sendProblem(reply, context.problems.invalid('the stream parameter is required'));
  context.kernel().hub.unsubscribe(streamId, request.params.sid);
  return reply.code(204).send();
}

export function registerStreamRoutes(app: FastifyInstance, context: RouteContext): void {
  app.get<{ Querystring: StreamQuery }>('/api/v1/events', (request, reply) => openStream(context, request, reply));
  app.post('/api/v1/subscriptions', (request, reply) => subscribe(context, request, reply));
  app.delete<{ Params: { sid: string }; Querystring: StreamQuery }>('/api/v1/subscriptions/:sid', (request, reply) => unsubscribe(context, request, reply));
}
