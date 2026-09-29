import { filterSchema, jsonObjectSchema, promptListLimit, ulidSchema, type Json, type JsonObject, type PromptNames, type PromptSchemas } from '@kvman/protocol';
import type { Ctx, Deferred } from '@kvman/sdk';
import { kernelProblem, ProblemError } from '../problems.ts';

export type PromptKey = (data: unknown) => unknown;

type ClosedStatus = 'answered' | 'rejected' | 'expired';

function invalid(ctx: Ctx, detail: string, issues: Array<{ path: string; message: string }>): ProblemError {
  return new ProblemError(kernelProblem('VALIDATION_FAILED', { correlationId: ctx.message.correlationId, messageId: ctx.message.id, detail, issues }));
}

// Values the host parsed with the prompt's own schemas; parsing again as JSON gives them their JSON type.
function jsonFields(value: Record<string, unknown>): JsonObject {
  return jsonObjectSchema.parse(value);
}

// ADR 0167: the handlers of a prompt's registered pieces. They act only through ctx, like any handler, so a prompt
// behaves the same in every host.
export function promptHandlers(names: PromptNames, schemas: PromptSchemas, key: PromptKey | undefined) {
  const prompts = (ctx: Ctx) => ctx.store.collection(names.collection);

  async function openKeyOf(ctx: Ctx, data: JsonObject): Promise<string | undefined> {
    if (key === undefined) return undefined;
    const value = key(data);
    if (typeof value !== 'string' || value === '') throw invalid(ctx, `oneOpenPer of the prompt ${names.name} must return a non-empty string`, [{ path: 'oneOpenPer', message: 'expected a string' }]);
    const [open] = await prompts(ctx).find({ where: { status: 'open', openKey: value }, limit: 1 });
    if (open !== undefined) throw ctx.problem(names.busy, { params: { key: value } });
    return value;
  }

  async function close(ctx: Ctx, id: string, status: ClosedStatus, answer?: JsonObject): Promise<void> {
    const prompt = await prompts(ctx).get(id);
    if (prompt?.['status'] !== 'open') return;
    await prompts(ctx).patch(id, { status, closedAt: ctx.now(), ...(answer === undefined ? {} : { answer }) });
    ctx.publish(names.closed, { [names.idField]: id, status });
  }

  function idOf(input: Record<string, unknown>): string {
    return ulidSchema.parse(input[names.idField]);
  }

  return {
    async open(ctx: Ctx, data: unknown): Promise<Deferred> {
      const parsed = schemas.document.shape.data.safeParse(data);
      if (!parsed.success) {
        throw invalid(ctx, 'the prompt data does not match its schema', parsed.error.issues.map((issue) => ({ path: ['data', ...issue.path.map(String)].join('.'), message: issue.message })));
      }
      const stored = jsonFields(parsed.data);
      const openKey = await openKeyOf(ctx, stored);
      const id = ctx.message.id;
      prompts(ctx).put({ id, data: stored, status: 'open', ...(openKey === undefined ? {} : { openKey }), openedAt: ctx.now() });
      ctx.publish(names.asked, { [names.idField]: id });
      return ctx.defer({ onAbort: names.expire });
    },
    async list(input: Record<string, unknown>, ctx: Ctx) {
      const { status, limit, ...fields } = jsonFields(input);
      const conditions: Record<string, Json> = status === undefined ? {} : { status };
      for (const [field, value] of Object.entries(fields)) conditions[`data.${field}`] = value;
      const where = filterSchema.safeParse(conditions);
      if (!where.success) {
        throw invalid(ctx, 'a data filter matches JSON scalars only', where.error.issues.map((issue) => ({ path: issue.path.map(String).join('.').replace(/^data\./, ''), message: issue.message })));
      }
      const items = await prompts(ctx).find({ where: where.data, orderBy: [['openedAt', 'asc']], limit: typeof limit === 'number' ? limit : promptListLimit });
      return schemas.listOutput.parse({ items });
    },
    async answer(input: Record<string, unknown>, ctx: Ctx) {
      const id = idOf(input);
      const answer = jsonFields(Object.fromEntries(Object.entries(input).filter(([field]) => field !== names.idField)));
      ctx.reply(id, answer);
      await close(ctx, id, 'answered', answer);
      return {};
    },
    async reject(input: Record<string, unknown>, ctx: Ctx) {
      const id = idOf(input);
      ctx.reply(id, { rejected: true });
      await close(ctx, id, 'rejected');
      return {};
    },
    async expire(input: { commandId: string }, ctx: Ctx) {
      await close(ctx, input.commandId, 'expired');
      return {};
    },
  };
}
