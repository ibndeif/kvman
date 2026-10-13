import { z, type Ctx } from '@kvman/sdk';
import { chatIdOf } from '../artifacts/artifact-records.ts';
import { changedSteps, mapProgress, plannedSteps, shapeProblem } from '../maps/map-rules.ts';
import { mapStatuses, mapStepSchema, type MapDoc } from '../maps/map-schema.ts';
import { invalid, notFound, tooLarge } from '../problems.ts';
import { kebab } from '../schemas/registry.ts';
import { findSession, now } from '../sessions/session-lookup.ts';
import { txRecords, type TxRecords } from '../store/collections.ts';
import { callInput, type ConnectorCommand } from './connector-command.ts';

// The `execution-map` connector (plan 08 §8.5, ADR 0064): the lead's plan of a task as steps that wait on each other,
// which the person watches as a diagram. Each change returns where the work is and what can start, so the task stays
// at the end of the context. A child session never has it.

/** What the prompt's index says the connector is for. */
export const executionMapDescription =
  'Plan a task of several steps as the execution map, the diagram the person watches, and keep it true as you work. A step names what it comes after, so steps with nothing between them run together. Start a step with status doing, finish it with done and your evidence, and record a problem the task does not need with note instead of looking into it.';

/** The steps one map holds at most, and its notes. */
export const stepsLimit = 40;
export const notesLimit = 50;

const idMessage = 'A step id is lowercase kebab case, such as read-code, up to 50 characters.';
const stepId = z.string().max(50, idMessage).regex(kebab, idMessage);

const usedName = z.string().min(1).max(60);
// A step names what it uses as one name or a few (ADR 0064, 2): a model writes either, and the map keeps one text.
const usedText = (uses: string | string[] | undefined): string | undefined => (Array.isArray(uses) ? uses.join(', ') : uses);

const payloads = {
  set: z.strictObject({
    goal: z.string().min(1).max(300).describe('What the whole task delivers, in one sentence.'),
    steps: z
      .array(
        z.strictObject({
          id: stepId.describe('The name of the step within the map, in lowercase kebab case.'),
          title: z.string().min(1).max(100).describe('What the step does, in a few words the person reads.'),
          after: z.array(stepId).describe('The ids of the steps that must be finished before this one; leave it out for a step that can start at once.').exactOptional(),
          uses: z.union([usedName, z.array(usedName).min(1).max(5)]).describe('The connector or worker the step uses, such as fs or delegate reviewer; several as a list.').exactOptional(),
          check: z.string().min(1).max(300).describe('How you will verify the step: the command you will run or what you will look at.'),
        }),
      )
      .min(1)
      .max(stepsLimit)
      .describe('The steps, each naming what it comes after.'),
  }),
  update: z.strictObject({
    steps: z
      .array(
        z.strictObject({
          id: stepId.describe('The step to change.'),
          status: z.enum(mapStatuses).describe('doing when you start it, done when it is verified, failed or skipped with a note, todo to start over.'),
          evidence: z.string().min(10).max(500).describe('For done: what you ran or checked and what it showed.').exactOptional(),
          note: z.string().min(1).max(300).describe('For failed and skipped: why. Otherwise a remark the person sees on the step.').exactOptional(),
        }),
      )
      .min(1)
      .max(stepsLimit)
      .describe('The changes, applied in order; if one is refused, none is made.'),
  }),
  note: z.strictObject({ text: z.string().min(1).max(500).describe('A problem or idea the task does not need, for the person to decide on later.') }),
  get: z.strictObject({}),
};

const progress = '{ goal, progress, doing, ready, waiting, failed, notes }: progress is "N of M done", and each list holds "<id>: <title>".';

export const executionMapCommands = {
  set: { registration: 'kvcoder.map.set', description: 'Makes the execution map, or replaces it; a step whose id stays keeps how far it got.', payload: payloads.set, asks: false, result: progress },
  update: { registration: 'kvcoder.map.step.update', description: 'Changes the status of one or more steps of the map.', payload: payloads.update, asks: false, result: progress },
  note: { registration: 'kvcoder.map.note.add', description: 'Adds a finding to the map\'s "Noted for later" list.', payload: payloads.note, asks: false, result: progress },
  get: { registration: 'kvcoder.map.state.get', description: 'Reads the whole execution map.', payload: payloads.get, asks: false },
} satisfies Record<string, ConnectorCommand>;

const progressSchema = z.object({ goal: z.string(), progress: z.string(), doing: z.array(z.string()), ready: z.array(z.string()), waiting: z.array(z.string()), failed: z.array(z.string()), notes: z.number().int() });

const noMap = () => notFound('This chat has no execution map yet. Make one with execution-map set.');

function existing(store: TxRecords, chatId: string) {
  const [found] = store.maps.find({ sessionId: chatId }, { limit: 1 });
  if (found === undefined) throw noMap();
  return found;
}

// A map belongs to its chat, as an artifact does.
const chatOf = async (ctx: Ctx, sessionId: string): Promise<string> => chatIdOf(await findSession(ctx, sessionId));

function saved(store: TxRecords, found: { id: string; version: number }, change: Partial<Pick<MapDoc, 'goal' | 'steps' | 'notes'>>) {
  return store.maps.update(found.id, { ...change, version: found.version + 1, updatedAt: now() });
}

const commands = executionMapCommands;

export function registerExecutionMapConnector(ctx: Ctx): void {
  ctx.registerCommand('kvcoder.map.set', {
    description: commands.set.description,
    input: callInput(payloads.set),
    output: progressSchema,
    retries: 0,
    handle: async ({ sessionId, payload }) => {
      const planned = payload.steps.map((step) => ({ ...step, uses: usedText(step.uses) }));
      const problem = shapeProblem(planned);
      if (problem !== undefined) throw invalid(problem);
      const chatId = await chatOf(ctx, sessionId);
      return ctx.store.transaction((tx) => {
        const store = txRecords(tx);
        const [found] = store.maps.find({ sessionId: chatId }, { limit: 1 });
        const steps = plannedSteps(planned, found?.steps ?? []);
        const stamp = now();
        if (found === undefined) return mapProgress(store.maps.insert({ sessionId: chatId, goal: payload.goal, steps, notes: [], version: 1, createdAt: stamp, updatedAt: stamp }));
        return mapProgress(saved(store, found, { goal: payload.goal, steps }));
      });
    },
  });
  ctx.registerCommand('kvcoder.map.step.update', {
    description: commands.update.description,
    input: callInput(payloads.update),
    output: progressSchema,
    retries: 0,
    handle: async ({ sessionId, payload }) => {
      const chatId = await chatOf(ctx, sessionId);
      return ctx.store.transaction((tx) => {
        const store = txRecords(tx);
        const found = existing(store, chatId);
        const steps = changedSteps(found.steps, payload.steps);
        if (typeof steps === 'string') throw invalid(steps);
        return mapProgress(saved(store, found, { steps }));
      });
    },
  });
  ctx.registerCommand('kvcoder.map.note.add', {
    description: commands.note.description,
    input: callInput(payloads.note),
    output: progressSchema,
    retries: 0,
    handle: async ({ sessionId, payload }) => {
      const chatId = await chatOf(ctx, sessionId);
      return ctx.store.transaction((tx) => {
        const store = txRecords(tx);
        const found = existing(store, chatId);
        if (found.notes.length >= notesLimit) throw tooLarge(`The map already holds ${notesLimit} notes. Report them to the person before you add more.`, notesLimit);
        return mapProgress(saved(store, found, { notes: [...found.notes, { text: payload.text, createdAt: now() }] }));
      });
    },
  });
  ctx.registerQuery('kvcoder.map.state.get', {
    description: commands.get.description,
    input: callInput(payloads.get),
    output: progressSchema.extend({ steps: z.array(mapStepSchema), noted: z.array(z.string()) }),
    handle: async ({ sessionId }) => {
      const chatId = await chatOf(ctx, sessionId);
      const found = await ctx.store.transaction((tx) => existing(txRecords(tx), chatId));
      return { ...mapProgress(found), steps: found.steps, noted: found.notes.map((note) => note.text) };
    },
  });
}
