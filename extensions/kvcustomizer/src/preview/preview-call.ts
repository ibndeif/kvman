import { ProblemError, z, type Ctx } from '@kvman/sdk';
import { kvcustomizerProblem } from '../problems.ts';
import { previewRecordSchema, recordKey } from './preview-state.ts';

// `preview query-get` and `preview command-run` (plan 09 §9.3, ADR 0022, 8 and 14): one call of the preview kvman over
// its HTTP API (plan 04 §4.1), at the `127.0.0.1` URL stored when the preview started. The answer is the preview's own
// envelope, so the agent reads a failure of its extension as data.

export type PreviewRoute = 'queries' | 'commands';

/** The preview's envelope without its job id: the output of a call, or its Problem. */
export const previewAnswerSchema = z.union([
  z.object({ ok: z.literal(true), output: z.json() }),
  z.object({ ok: z.literal(false), problem: z.object({ code: z.string(), message: z.string(), params: z.record(z.string(), z.json()).exactOptional() }) }),
]);

export type PreviewAnswer = z.output<typeof previewAnswerSchema>;

/** What the preview answered, or `kvcustomizer/PREVIEW_FAILED` when it isn't kvman's envelope. */
export function previewAnswer(body: unknown): PreviewAnswer {
  const parsed = previewAnswerSchema.safeParse(body);
  if (!parsed.success) throw kvcustomizerProblem('PREVIEW_FAILED', "The preview's answer isn't one kvman gives.");
  return parsed.data.ok ? { ok: true, output: parsed.data.output } : { ok: false, problem: parsed.data.problem };
}

async function previewUrl(ctx: Ctx): Promise<string> {
  const running = (await ctx.processes.list()).some((process) => process.name === 'preview');
  const record = previewRecordSchema.safeParse(await ctx.store.kv.get(recordKey));
  if (!running || !record.success) throw new ProblemError({ code: 'NOT_FOUND', message: 'No preview is running; start one with preview start.' });
  return record.data.url;
}

async function post(address: URL, input: Record<string, unknown>, signal: AbortSignal): Promise<unknown> {
  try {
    const response = await fetch(address, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input }), signal });
    return await response.json();
  } catch (error) {
    if (error instanceof TypeError || error instanceof SyntaxError) throw kvcustomizerProblem('PREVIEW_FAILED', `The preview didn't answer the call: ${error.message}`);
    throw error;
  }
}

/** Runs one public query or command of the running preview, in its Home. */
export async function callPreview(ctx: Ctx, route: PreviewRoute, name: string, input: Record<string, unknown>): Promise<PreviewAnswer> {
  const address = new URL(`api/${route}/${encodeURIComponent(name)}`, await previewUrl(ctx));
  return previewAnswer(await post(address, input, ctx.job.signal));
}
