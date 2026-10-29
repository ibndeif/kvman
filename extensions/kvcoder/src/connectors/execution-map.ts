import { z, type Ctx } from '@kvman/sdk';
import { chatIdOf } from '../artifacts/artifact-records.ts';
import { changedSteps, mapProgress, plannedSteps, shapeProblem, unknownStep } from '../maps/map-rules.ts';
import { mapStatuses, mapStepSchema, type MapDoc } from '../maps/map-schema.ts';
import { invalid, notFound, tooLarge } from '../problems.ts';
import { kebab } from '../schemas/registry.ts';
import { findSession, now } from '../sessions/session-lookup.ts';
import { txRecords, type TxRecords } from '../store/collections.ts';
import { callInput, type ConnectorCommand } from './connector-command.ts';

// The `execution-map` connector (plan 08 §8.5, ADR 0064, ADR 0072, ADR 0074, ADR 0075, ADR 0086): the lead's plan of a task as steps that wait on each other,
// which the person watches as a diagram. Each change returns where the work is and what can start, so the task stays
// at the end of the context. A child session never has it.

/** What the prompt's index says the connector is for. */
export const executionMapDescription =
  "Plan work as the execution map: your execution path, and the implementation plan the person reads, agrees to, and watches as a diagram. Keep it true as you work: the person follows the work on it. Give the goal, the outcome the person wants in their own terms, then the steps. A step is one concrete stage of the path, something you can name before you start it, never a phase such as implement or a whole feature: what gets done, who does it, and how it is checked; it may cover the few files that change together. Its uses names who does it: you, with a connector such as fs, or a worker of delegate whose description in the delegate entry fits the step, such as a design that is a real choice, a structure decision across several parts, or a review of a finished change that is risky or wide. Its check is the exact command you will run or the thing you will look at. Your own steps are one line, each after the one before. Steps side by side are branches, and a branch means delegation: draw one only for work a worker does that needs nothing from the other branches, touches files no other branch touches, and is worth a worker that starts with none of this conversation; give the branches that start together the same after, or none, and add the step that joins them after every branch it needs. Don't split small independent changes into branches, leave out any step that nothing needs, and end with the project's own checks after everything they cover. A bug fix, a change to one or two files, or a fix the person described never gets a map. Give each step its details in the same set call: what it changes and how, naming the files or parts and the approach in words the person understands without the code, in Markdown, with lists, tables, and Mermaid diagrams or charts in fenced mermaid blocks, never SVG. The person opens them with a press, and a step can't be doing until it has them. Setting the map again keeps the status of each step whose id stays, and its details when you give none: give details again only for a step whose approach changed, and for each new step. Use detail to change one step's details on their own. Every map call returns the steps that are ready: take those, and never work on a step the map does not have. Mark a step doing in the same reply as your first call on it, and when several are ready, mark each and start them all in one reply, one delegate run per branch. Mark a step done with your evidence, what you ran and what it showed, as soon as its check passed and before you start the next; failed with a note when you can't finish it, and skipped with a note when it turned out unneeded. When the plan itself changes, set the map again before you go on, and record a problem the work does not need with note instead of looking into it. Limits: goal up to 300 characters; 1 to 40 steps; a step's id lowercase kebab case up to 50, title up to 100, uses one name up to 60 or a list of up to 5, check up to 300, and details up to 4,000; a step's evidence 10 to 500 and its note up to 300; a note of note up to 500.";

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
          uses: z.union([usedName, z.array(usedName).min(1).max(5)]).describe('Who does the step: a connector such as fs, or a worker as delegate and its name; several as a list.').exactOptional(),
          check: z.string().min(1).max(300).describe('How you will verify the step: the command you will run or what you will look at.'),
          details: z.string().min(1).max(4000).describe('What the step changes and how, in Markdown, as detail takes them; leave it out to keep the details the step has.').exactOptional(),
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
  detail: z.strictObject({
    id: stepId.describe('The step to detail.'),
    details: z.string().min(1).max(4000).describe('What the step changes and how, in Markdown: name the files or parts and the approach, and use lists, tables, and Mermaid diagrams or charts in fenced mermaid blocks where they help, never SVG.'),
  }),
  note: z.strictObject({ text: z.string().min(1).max(500).describe('A problem or idea the task does not need, for the person to decide on later.') }),
  get: z.strictObject({ id: stepId.describe('A step to read whole, with its details; leave it out to read the map without the details.').exactOptional() }),
};

const progress = '{ goal, progress, doing, ready, waiting, failed, undetailed, notes }: progress is "N of M done", and each list holds "<id>: <title>".';

export const executionMapCommands = {
  set: { registration: 'kvcoder.map.set', description: "Makes the execution map with each step's details, or replaces it; a step whose id stays keeps how far it got, and its details when it gives none.", payload: payloads.set, asks: false, result: progress },
  detail: { registration: 'kvcoder.map.step.details.set', description: 'Writes the details of one step of the map.', payload: payloads.detail, asks: false, result: progress },
  update: { registration: 'kvcoder.map.step.update', description: 'Changes the status of one or more steps of the map.', payload: payloads.update, asks: false, result: progress },
  note: { registration: 'kvcoder.map.note.add', description: 'Adds a finding to the map\'s "Noted for later" list.', payload: payloads.note, asks: false, result: progress },
  get: { registration: 'kvcoder.map.state.get', description: "Reads the execution map without the steps' details, or one step whole.", payload: payloads.get, asks: false },
} satisfies Record<string, ConnectorCommand>;

const progressSchema = z.object({ goal: z.string(), progress: z.string(), doing: z.array(z.string()), ready: z.array(z.string()), waiting: z.array(z.string()), failed: z.array(z.string()), undetailed: z.array(z.string()), notes: z.number().int() });

// `get` without an id leaves the details out, so a large map doesn't fill the context (ADR 0086, 8).
const lightStepSchema = mapStepSchema.omit({ details: true });
const noted = z.array(z.string());

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
  ctx.registerCommand('kvcoder.map.step.details.set', {
    description: commands.detail.description,
    input: callInput(payloads.detail),
    output: progressSchema,
    retries: 0,
    handle: async ({ sessionId, payload }) => {
      const chatId = await chatOf(ctx, sessionId);
      return ctx.store.transaction((tx) => {
        const store = txRecords(tx);
        const found = existing(store, chatId);
        const index = found.steps.findIndex((step) => step.id === payload.id);
        const step = found.steps[index];
        if (step === undefined) throw invalid(unknownStep(found.steps, payload.id));
        return mapProgress(saved(store, found, { steps: found.steps.with(index, { ...step, details: payload.details }) }));
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
    output: z.union([progressSchema.extend({ steps: z.array(lightStepSchema), noted }), progressSchema.extend({ step: mapStepSchema, noted })]),
    handle: async ({ sessionId, payload }) => {
      const chatId = await chatOf(ctx, sessionId);
      const found = await ctx.store.transaction((tx) => existing(txRecords(tx), chatId));
      const read = { ...mapProgress(found), noted: found.notes.map((note) => note.text) };
      if (payload.id === undefined) return { ...read, steps: found.steps.map((step) => lightStepSchema.parse(step)) };
      const step = found.steps.find((candidate) => candidate.id === payload.id);
      if (step === undefined) throw invalid(unknownStep(found.steps, payload.id));
      return { ...read, step };
    },
  });
}
