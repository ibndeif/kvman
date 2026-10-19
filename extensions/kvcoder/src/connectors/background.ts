import { z, type Ctx } from '@kvman/sdk';
import { delay } from '../delay.ts';
import { cancelJob, jobDetail, jobRows, type JobRow } from '../jobs/job-rows.ts';
import { records } from '../store/collections.ts';
import { callInput, type ConnectorCommand } from './connector-command.ts';
import { cutInto } from './payload-fields.ts';

// The `background` connector (plan 08 §8.5, ADR 0011, 6): what this chat started with `background: true`, a process or
// a subagent, listed, read, waited for, or stopped by the id the starting call returned. The agent sees no kernel job.

/** What the prompt's index says the connector is for. */
export const backgroundDescription =
  'Follow up on what you started with background set to true: a server or other long-running shell line, or a background subagent. Use it to see its status or output, to wait for it to end, or to stop it. When you need a run\'s result before you can go on, call wait once: asking for its output again and again fills the conversation, and a run that ends tells you in a message anyway.';

const id = z.string().min(1).describe('The id that the call which started the work returned.');
const started = z.strictObject({ id });

/** How long `wait` waits when the call names no time, the most it waits, and how often it looks. */
export const waitDefaultMs = 120_000;
export const waitLimitMs = 600_000;
const waitLeastMs = 1_000;
const linesDefault = 100;
const linesLimit = 500;
const lookEveryMs = 500;
const titleShown = 80;

const payloads = {
  list: z.strictObject({}),
  output: z.strictObject({ id, lines: z.number().int().describe("How many of a process's last lines to return: 100 by default, 500 at most; a larger number is cut to 500.").exactOptional() }),
  wait: z.strictObject({ id, timeoutMs: z.number().int().describe('The most to wait, in milliseconds: 120000 by default, from 1000 to 600000; a number outside them is cut into them.').exactOptional() }),
  stop: started,
};

export const backgroundCommands = {
  list: { registration: 'kvcoder.background.list', description: "Lists this chat's newest 50 background runs, newest first, each with its id, kind, title, and status.", payload: payloads.list, asks: false },
  output: { registration: 'kvcoder.background.output.get', description: "Gives one background run's status, and its output (a process's last lines, a subagent's answer, or what a program worker's run returned); a subagent's also says how far it got (progress) and, when its status is waiting, the calls it waits on the person for (waitingFor).", payload: payloads.output, asks: false },
  wait: { registration: 'kvcoder.background.wait', description: 'Waits until a background run ends, a helper starts waiting on the person (status waiting), the person sends a message (note), or the time passes, then gives its status and output as output does.', payload: payloads.wait, asks: false },
  stop: { registration: 'kvcoder.background.stop', description: "Stops a background process or a program worker's run, or cancels a background subagent.", payload: payloads.stop, asks: false },
} satisfies Record<string, ConnectorCommand>;

const times = { status: z.string(), startedAt: z.string(), endedAt: z.string().exactOptional(), exitCode: z.number().int().exactOptional() };
const kind = z.enum(['process', 'subagent', 'worker']);
const rowSchema = z.object({ id: z.string(), kind, call: z.string(), ...times });
const shortRowSchema = z.object({ id: z.string(), kind, title: z.string(), ...times });
const detailSchema = rowSchema.extend({ output: z.json().exactOptional(), problem: z.json().exactOptional(), progress: z.object({ steps: z.number().int(), lastActivityAt: z.string(), recentCalls: z.array(z.string()) }).exactOptional(), waitingFor: z.array(z.string()).exactOptional(), note: z.string().exactOptional() });

const ended = (row: JobRow) => ({ ...(row.endedAt === undefined ? {} : { endedAt: row.endedAt }), ...(row.exitCode === undefined ? {} : { exitCode: row.exitCode }) });
const forAgent = (row: JobRow): z.output<typeof rowSchema> => ({ id: row.id, kind: row.kind, call: row.call, status: row.status, startedAt: row.startedAt, ...ended(row) });
// A list names each run in a few words (ADR 0068, 2): the whole line or task is in `output`.
const shortRow = (row: JobRow): z.output<typeof shortRowSchema> => ({ id: row.id, kind: row.kind, title: row.title.length > titleShown ? `${row.title.slice(0, titleShown - 1)}…` : row.title, status: row.status, startedAt: row.startedAt, ...ended(row) });

// A message from the person queued for the chat ends a wait, so the step ends and the message is read (ADR 0085, 3).
const personWrote = async (ctx: Ctx, sessionId: string): Promise<boolean> => (await records(ctx.store).queued.find({ sessionId }, { limit: 100 })).some((item) => item.source.kind === 'user');

async function startedBy(ctx: Ctx, sessionId: string, runId: string, lines?: number) {
  const found = await jobDetail(ctx, sessionId, runId, lines);
  if (found === undefined) throw ctx.problem('kvcoder/JOB_NOT_FOUND', { sessionId, id: runId });
  return found;
}

const commands = backgroundCommands;

export function registerBackgroundConnector(ctx: Ctx): void {
  ctx.registerQuery('kvcoder.background.list', {
    description: commands.list.description,
    input: callInput(payloads.list),
    output: z.array(shortRowSchema),
    handle: async ({ sessionId }) => (await jobRows(ctx, sessionId)).map(shortRow),
  });
  ctx.registerQuery('kvcoder.background.output.get', {
    description: commands.output.description,
    input: callInput(payloads.output),
    output: detailSchema,
    handle: async ({ sessionId, payload }) => {
      const found = await startedBy(ctx, sessionId, payload.id, cutInto(payload.lines ?? linesDefault, 1, linesLimit));
      return { ...forAgent(found.row), ...found.detail };
    },
  });
  // A run is looked at until it has ended (ADR 0068, 1), as a line in the shell waits on its process: the wait is this job's own.
  // It ends early when a helper starts waiting on the person (ADR 0085, 2) or the person sends a message (ADR 0085, 3).
  ctx.registerCommand('kvcoder.background.wait', {
    description: commands.wait.description,
    input: callInput(payloads.wait),
    output: detailSchema,
    retries: 0,
    timeoutMs: waitLimitMs + 60_000,
    handle: async ({ sessionId, payload }) => {
      const until = Date.now() + cutInto(payload.timeoutMs ?? waitDefaultMs, waitLeastMs, waitLimitMs);
      let found = await startedBy(ctx, sessionId, payload.id);
      while (found.row.status === 'running' && Date.now() < until) {
        if (await personWrote(ctx, sessionId)) return { ...forAgent(found.row), ...found.detail, note: 'The person sent a message.' };
        await delay(Math.min(lookEveryMs, until - Date.now()), ctx.job.signal);
        ctx.job.signal.throwIfAborted();
        found = await startedBy(ctx, sessionId, payload.id);
      }
      return { ...forAgent(found.row), ...found.detail };
    },
  });
  ctx.registerCommand('kvcoder.background.stop', {
    description: commands.stop.description,
    input: callInput(payloads.stop),
    output: z.object({ stopped: z.boolean() }),
    retries: 0,
    handle: async ({ sessionId, payload }) => ({ stopped: await cancelJob(ctx, sessionId, (await startedBy(ctx, sessionId, payload.id)).row, 'agent') }),
  });
}
