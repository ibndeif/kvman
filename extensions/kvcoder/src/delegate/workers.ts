import { ProblemError, z, type Ctx } from '@kvman/sdk';
import { thinkingSchema } from '../schemas/records.ts';
import { wordSchema } from '../schemas/registry.ts';

// The workers the `delegate` connector hands tasks to (plan 08 §8.5, ADR 0021, 4, 5, 7, and 20): the setting
// `kvcoder.delegate.workers`. A worker runs a subagent with its own instructions, connectors, model, and thinking, or
// a program on this computer, and is available while it is turned on.

/** The most a worker's instructions hold, a section's cap. */
const instructionsLimit = 16 * 1024;

const common = {
  name: wordSchema,
  description: z.string().min(1),
  enabled: z.boolean(),
  instructions: z.string().refine((text) => Buffer.byteLength(text, 'utf8') <= instructionsLimit, 'Instructions hold at most 16 KB.'),
};

/** A worker that runs a subagent: a child session with its own connectors, model, and thinking; `readOnly` refuses its helper every call that could change something (ADR 0056, 1). */
export const subagentWorkerSchema = z.strictObject({ ...common, kind: z.literal('subagent'), readOnly: z.boolean().default(false), connectors: z.array(z.string()).nullable(), model: z.string().min(1).nullable(), thinking: thinkingSchema.nullable() });

// A worker that runs a program on this computer (ADR 0021, 12, 13, and 31): whether a run asks first, how long it may
// take, and the flags that matter, each `null` to leave its flag out.
const program = { ...common, approval: z.enum(['ask', 'auto']), timeoutMs: z.number().int().min(60_000).max(7_200_000) };
const flag = z.string().min(1).nullable();

// A run nobody is asked about must not also approve its own actions (ADR 0021, 39): the task comes from the model,
// which may have been steered by what it read.
const unattended = 'A worker that starts at once must not approve its own actions: set it to ask before a run, or choose a stricter mode.';

/** The permission modes in which Claude Code acts without asking anyone. */
export const unaskedModes: readonly string[] = ['bypassPermissions', 'auto', 'dontAsk'];

export const opencodeWorkerSchema = z.strictObject({ ...program, kind: z.literal('opencode'), model: flag, agent: flag, autoApprove: z.boolean() }).refine((worker) => worker.approval === 'ask' || !worker.autoApprove, unattended);
export const piWorkerSchema = z.strictObject({ ...program, kind: z.literal('pi'), model: flag, thinking: z.enum(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']).nullable(), tools: z.array(z.string().min(1)).nullable() });
export const claudeWorkerSchema = z.strictObject({
  ...program,
  kind: z.literal('claude'),
  model: flag,
  effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).nullable(),
  permissionMode: z.enum(['acceptEdits', 'auto', 'bypassPermissions', 'dontAsk', 'plan']),
}).refine((worker) => worker.approval === 'ask' || !unaskedModes.includes(worker.permissionMode), unattended);

/** One worker: a subagent, or a program of one of the kinds kvcoder knows (ADR 0021, 3). */
export const workerSchema = z.discriminatedUnion('kind', [subagentWorkerSchema, opencodeWorkerSchema, piWorkerSchema, claudeWorkerSchema]);

/** The `kvcoder.delegate.workers` setting: each worker has its own name. */
export const workersSchema = z.array(workerSchema).refine((workers) => new Set(workers.map((worker) => worker.name)).size === workers.length, 'Each worker needs its own name.');

export type Worker = z.output<typeof workerSchema>;
export type SubagentWorker = z.output<typeof subagentWorkerSchema>;
export type ProgramWorker = Exclude<Worker, SubagentWorker>;

/** Whether a worker runs a program, not a subagent. */
export const isProgram = (worker: Worker): worker is ProgramWorker => worker.kind !== 'subagent';

/** The name a program worker's check has among a session's checks (ADR 0021, 37). */
export const workerCheckName = (name: string): string => `worker:${name}`;

const shipped = (name: string, description: string, instructions: string, readOnly = false): SubagentWorker => ({ name, description, enabled: true, kind: 'subagent', readOnly, instructions, connectors: null, model: null, thinking: null });

// The shipped specialists' instructions (ADR 0076): each adds its role's craft to the worker's method, which already says
// how a helper understands, does, and returns, so none of them repeats it.
const designer = [
  'You are a senior UI/UX designer. You own the experience and the look of what the task asks for: what the person sees, understands, and does next.',
  "Start from the person: who uses this, what they came to do, and the shortest clear way there. Read the project's existing screens, components, styles, tokens, and wording first, and design with them; propose something new only where nothing existing fits, and say why.",
  "Experience: one main action on a screen, the common path in the fewest steps, plain wording in the person's own words, a visible response to every action, a way back or a confirmation for what can't be undone, errors that say what happened and what to do next, and every state designed: empty, loading, partial, error, success, and disabled.",
  "Visuals: a clear hierarchy, where size, weight, spacing, and contrast show what matters first; one spacing scale and one type scale; alignment to a grid; color that carries meaning and is never the only signal; and the project's light and dark themes.",
  'Standards: WCAG 2.2 AA (text contrast of 4.5 to 1, everything reachable by keyboard with a visible focus, a label or a name on every control, targets of at least 24 by 24 px), a layout that holds from a phone to a wide screen, both writing directions where the project has them, and reduced motion respected.',
  "Return the design in your answer: the flow step by step, each screen's layout, states, and exact wording, the components and tokens it uses, the choices you made and why, and a page's HTML and CSS when layout matters. Don't change the project's files unless the task asks you to build the design; when it does, build it with the project's own components and check it as the person will see it.",
].join('\n');

const architect = [
  'You are a senior software architect. You own the structure of what the task asks for: the parts, their boundaries, and how they fit what the project already is.',
  "Read before you propose: the code the task touches, the code beside it that solves a similar problem, and the project's rules (its guides, `AGENTS.md`, config, lint rules, and tests). Work out the project's patterns and conventions from them (its layers, naming, error handling, data access, and tests) and design inside them. Where your design departs from one, say so and why.",
  "Design on sound engineering practice: one clear responsibility per part, high cohesion and low coupling, dependencies that point one way and never in a circle, an explicit contract at every boundary (inputs, outputs, errors), one owner for each piece of data, validation at the edges, failures handled where something can be done about them, and security, performance, and testability thought through on the paths that need them.",
  "Prefer the simplest design that does what was asked: reuse what exists, and add no layer, abstraction, option, or dependency the task doesn't need. For a decision that matters, weigh at least one real alternative and say why you chose as you did.",
  "Return the design in your answer: the parts and each one's responsibility, the shapes and contracts that pass between them, the files and modules to add or change, the order to build them in and what can be built side by side, the trade-offs you weighed, the risks and how each is contained, and how the result is tested. Don't edit the project's files.",
].join('\n');

const tester = [
  "You are a senior QA engineer. You test what the task names the way the people who depend on it will use it, and you report what is wrong; you don't fix it.",
  "Choose the test cases by risk, before you test. Read what was asked and what was built. First come the flows the business depends on: the main thing a person comes to do, and anything that touches money, data, or access. Then security, then performance. Then the edges of those: empty, very large, wrong, repeated, and out-of-order input, and a step that fails midway. Spend nothing on what can't break or doesn't matter.",
  "Automated: write the cases in the project's own test setup and style, each checking one behavior with real values and named for what it checks, and run them. A test must fail when the behavior breaks; one that only repeats the code proves nothing.",
  "By hand: use it as a person would. Run the app or the command and go through each flow from start to end, with the `mcp` connector's browser when there is one, and with requests and the shell when there isn't. Look at what a person would see, and try what a person would try: wrong input, going back, doing it twice, and an action they aren't allowed.",
  'Security: check that every input is validated, that a person reaches only what they are allowed to (try as someone else, and as no one), that no secret appears in an output, a log, or a file, and the injection that fits the technology (SQL, command, path, script).',
  'Performance: measure the critical paths with a realistic amount of data, and report the numbers and how you measured them. Name whatever grows faster than the data does.',
  "Report each issue with its severity (critical, high, medium, or low), the steps that reproduce it, what you expected, what happened, and the evidence. List the cases you ran, each passed or failed, and what you couldn't test. Don't change production code to make a test pass; report the defect. Stop what you started, and leave behind only the tests the task asked for.",
].join('\n');

const reviewer = [
  'You are a senior code reviewer. You read a change as the engineer who will maintain it, and you report what makes the code wrong, harder to read, or harder to change.',
  "Read the changes the task names in full, then the code around them, the code nearby that does a similar job, and the project's rules (its guides, `AGENTS.md`, and lint and format config). Judge against the project's own style and never against your taste.",
  "Style: whatever goes against the project's conventions in naming, layout, file and module structure, idiom, error handling, and comments.",
  'Complexity: a function or module that does more than one thing, deep nesting, a long parameter list, clever code where plain code would do, an abstraction, option, or layer with one user, and the same thing written twice.',
  'Unclean code: dead or commented-out code, leftovers (debug output, a TODO, a temporary file), stubs, workarounds, a swallowed error, and a value with no name.',
  "Unclear code: a name that doesn't say what the thing is, a function that does something other than its name says, a hidden side effect, a flow you had to read twice, a non-obvious reason with no comment, and a comment that repeats the code.",
  'A correctness or security defect you meet on the way is reported too, and comes first.',
  "Report each finding with its severity (must fix, should fix, or consider), its file and line, what is wrong, why it matters, and what you expect instead, with a line or two of code when that is clearer. Order the findings by severity, and leave out what the project's formatter or linter already settles. Say so plainly when you find nothing. Don't edit the project's files.",
].join('\n');

/** The workers kvcoder ships with: they differ by their instructions, and the architect and the reviewer are read-only (ADR 0021, 5; ADR 0056, 1; ADR 0076). */
export const shippedWorkers: SubagentWorker[] = [
  shipped('general', 'Any separate, self-contained task', ''),
  shipped('ui-ux', 'Designs the experience and the look of a screen or flow, to usability and accessibility standards', designer),
  shipped('architect', "Designs the structure of a change, on sound engineering practice and the project's own patterns and conventions", architect, true),
  shipped('tester', 'QA engineer: writes and runs test cases, automated and by hand as a person would, on the critical flows, security, and performance, and reports the issues', tester),
  shipped('reviewer', 'Reviews code and reports wrong style, needless complexity, and unclean or unclear code', reviewer, true),
];

/** The workers of the job's workspace, in the setting's order. */
export async function listedWorkers(ctx: Ctx): Promise<Worker[]> {
  return workersSchema.parse(await ctx.settings.get('kvcoder.delegate.workers'));
}

type Checks = readonly { name: string; passed: boolean }[] | null;

/** The workers a session can use: turned on, and for a program, one whose check passed (ADR 0021, 17). */
export async function availableWorkers(ctx: Ctx, checks: Checks): Promise<Worker[]> {
  const passed = new Set((checks ?? []).filter((check) => check.passed).map((check) => check.name));
  return (await listedWorkers(ctx)).filter((worker) => worker.enabled && (!isProgram(worker) || passed.has(workerCheckName(worker.name))));
}

function notFound(name: string, names: readonly string[]): ProblemError {
  return new ProblemError({ code: 'kvcoder/WORKER_NOT_FOUND', message: `There is no worker ${name}. ${names.length === 0 ? 'No worker is available.' : `The workers are: ${names.join(', ')}.`}`, params: { worker: name } });
}

/** One available worker by name, or `kvcoder/WORKER_NOT_FOUND` naming the ones there are. */
export async function availableWorker(ctx: Ctx, checks: Checks, name: string): Promise<Worker> {
  const workers = await availableWorkers(ctx, checks);
  const found = workers.find((worker) => worker.name === name);
  if (found === undefined) throw notFound(name, workers.map((worker) => worker.name));
  return found;
}

/** One worker of the list by name, turned on or not. */
export async function listedWorker(ctx: Ctx, name: string): Promise<Worker> {
  const workers = await listedWorkers(ctx);
  const found = workers.find((worker) => worker.name === name);
  if (found === undefined) throw notFound(name, workers.map((worker) => worker.name));
  return found;
}
