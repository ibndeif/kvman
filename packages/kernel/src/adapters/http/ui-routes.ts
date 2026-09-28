import { uiGetRequestSchema, uiPageGetRequestSchema, uiTranslationsGetRequestSchema } from '@kvman/protocol';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { callerOf } from './command-routes.ts';
import type { RouteContext } from './http-adapter.ts';
import { sendProblem } from './problem-replies.ts';

type UiType = 'kernel.ui.get' | 'kernel.ui.page.get' | 'kernel.ui.translations.get';

type Checked = ReturnType<typeof uiGetRequestSchema.safeParse> | ReturnType<typeof uiPageGetRequestSchema.safeParse>;

// ADR 0159: `If-None-Match` names the tag itself, its weak form, a list holding either, or `*`.
function matches(header: string | string[] | undefined, tag: string): boolean {
  const listed = (Array.isArray(header) ? header.join(',') : header ?? '').split(',').map((entry) => entry.trim()).filter((entry) => entry !== '');
  return listed.some((entry) => entry === '*' || entry.replace(/^W\//, '') === `"${tag}"`);
}

// 12 §12.2: the GET forms of the kernel.ui.* queries, with the query string as the payload, an ETag, and 304 when
// the caller already has that answer.
async function answerUi(context: RouteContext, request: FastifyRequest, reply: FastifyReply, type: UiType, payload: Checked): Promise<FastifyReply> {
  if (!payload.success) return sendProblem(reply, context.problems.invalid('the query string does not match its schema', payload.error.issues));
  const caller = callerOf(request);
  if (caller === undefined) return sendProblem(reply, context.problems.invalid('X-Kvman-Client or X-Kvman-Stream is not a valid name'));
  const answer = await context.kernel().runtime.query({ sender: caller.sender, type, payload: payload.data, cause: undefined, workspaceId: undefined });
  if (!answer.ok) return sendProblem(reply, answer.problem);
  if (answer.etag === undefined) return reply.code(200).send(answer.value);
  reply.header('etag', `"${answer.etag}"`);
  return matches(request.headers['if-none-match'], answer.etag) ? reply.code(304).send() : reply.code(200).send(answer.value);
}

export function registerUiRoutes(app: FastifyInstance, context: RouteContext): void {
  app.get('/api/v1/ui', (request, reply) => answerUi(context, request, reply, 'kernel.ui.get', uiGetRequestSchema.safeParse(request.query)));
  app.get<{ Params: { pageId: string } }>('/api/v1/ui/pages/:pageId', (request, reply) => {
    const query = typeof request.query === 'object' && request.query !== null ? request.query : {};
    return answerUi(context, request, reply, 'kernel.ui.page.get', uiPageGetRequestSchema.safeParse({ ...query, pageId: request.params.pageId }));
  });
  app.get('/api/v1/ui/translations', (request, reply) => answerUi(context, request, reply, 'kernel.ui.translations.get', uiTranslationsGetRequestSchema.safeParse(request.query)));
}
