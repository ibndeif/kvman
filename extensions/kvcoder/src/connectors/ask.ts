import { z, type Ctx } from '@kvman/sdk';
import { jsonOutput, type JsonValue } from '../connector-call.ts';
import { invalid } from '../problems.ts';
import type { QuestionDoc } from '../schemas/records.ts';
import { callInput, type ConnectorCommand } from './connector-command.ts';

// The `ask` connector (plan 08 §8.5): a question suspends the turn until the person answers; the answer becomes the
// call's result, and a dismissal gives `{ "dismissed": true }`. Each command's check validates its payload as a kernel
// job, and the step then records the question (ADR 0011, 9). Answers are checked (ADR 0009, 102).

/** What the prompt's index says the connector is for. */
export const askDescription = 'Put a question to the person and wait for the answer. Use it when you need a decision, a missing detail, or a go-ahead before a risky step, instead of guessing.';

const prompt = z.string().min(1).describe('The question, as the person reads it.');

const payloads = {
  text: z.strictObject({ prompt, placeholder: z.string().describe('A hint shown in the empty answer box.').exactOptional() }),
  choice: z.strictObject({
    prompt,
    multiple: z.boolean().describe('true when the person may choose several options.'),
    options: z
      .array(z.strictObject({ id: z.string().min(1).describe('What the answer names the option by.'), label: z.string().min(1).describe('The option, as the person reads it.'), description: z.string().describe('A line that explains the option.').exactOptional() }))
      .min(2)
      .max(10)
      .refine((options) => new Set(options.map((option) => option.id)).size === options.length, 'Option ids must differ.')
      .describe('Two to ten options, the recommended one first.'),
    other: z.boolean().describe('true lets the person write an answer of their own.').exactOptional(),
  }),
  confirm: z.strictObject({ prompt, danger: z.boolean().describe('true marks the confirmation as destructive.').exactOptional() }),
};

const dismissed = ', or { "dismissed": true }.';

export const askCommands = {
  text: { registration: 'kvcoder.ask.text.check', description: 'Asks the person for a free answer and waits for it.', payload: payloads.text, asks: false, result: `the person's answer: { "text" }${dismissed}` },
  choice: { registration: 'kvcoder.ask.choice.check', description: 'Asks the person to choose among options and waits for the answer.', payload: payloads.choice, asks: false, result: `the person's answer: { "selected": [ids], "other"? }${dismissed}` },
  confirm: { registration: 'kvcoder.ask.confirm.check', description: 'Asks the person yes or no and waits for the answer.', payload: payloads.confirm, asks: false, result: `the person's answer: { "confirmed" }${dismissed}` },
} satisfies Record<string, ConnectorCommand>;

export type QuestionKind = QuestionDoc['kind'];

/** The kinds of question the agent asks: the `ask` connector's commands. */
export const askKinds = ['text', 'choice', 'confirm'] as const;

export const isAskKind = (command: string): command is (typeof askKinds)[number] => askKinds.some((kind) => kind === command);

const noOutput = z.object({});

export function registerAskConnector(ctx: Ctx): void {
  for (const kind of askKinds) {
    const command = askCommands[kind];
    ctx.registerCommand(command.registration, { description: command.description, input: callInput(command.payload), output: noOutput, retries: 0, handle: () => ({}) });
  }
}

const dismissedSchema = z.strictObject({ dismissed: z.literal(true) });

const answerSchemas = {
  text: z.strictObject({ text: z.string() }),
  choice: z.strictObject({ selected: z.array(z.string()), other: z.string().exactOptional() }),
  confirm: z.strictObject({ confirmed: z.boolean() }),
  approval: z.strictObject({ confirmed: z.boolean() }),
};

function checkChoice(question: Record<string, JsonValue>, answer: { selected: string[]; other?: string | undefined }): void {
  const parsed = payloads.choice.parse(question);
  const ids = new Set(parsed.options.map((option) => option.id));
  const unknown = answer.selected.find((id) => !ids.has(id));
  if (unknown !== undefined) throw invalid(`${unknown} isn't one of the options.`, { selected: unknown });
  if (answer.other !== undefined && parsed.other !== true) throw invalid('This question offers no other answer.');
  const count = answer.selected.length + (answer.other === undefined ? 0 : 1);
  if (!parsed.multiple && count !== 1) throw invalid('Choose exactly one option.');
}

/** An answer checked against its question: the call's result, or an approval's decision. */
export function checkedAnswer(question: QuestionDoc, answer: unknown): { kind: 'result'; text: string } | { kind: 'approval'; approved: boolean } {
  const dismissed = dismissedSchema.safeParse(answer);
  if (question.kind === 'approval') {
    if (dismissed.success) return { kind: 'approval', approved: false };
    const parsed = answerSchemas.approval.safeParse(answer);
    if (!parsed.success) throw invalid('An approval is answered { confirmed } or { dismissed: true }.');
    return { kind: 'approval', approved: parsed.data.confirmed };
  }
  if (dismissed.success) return { kind: 'result', text: jsonOutput({ dismissed: true }).output };
  const parsed = answerSchemas[question.kind].safeParse(answer);
  if (!parsed.success) throw invalid(`The answer doesn't fit a ${question.kind} question.`);
  if ('selected' in parsed.data) checkChoice(question.question, parsed.data);
  return { kind: 'result', text: jsonOutput(parsed.data).output };
}

/** What a question, or an approval, dismissed by a message returns to the model (plan 08 §8.1). */
export function dismissedText(kind: QuestionKind): string {
  return kind === 'approval' ? 'denied by the user' : 'dismissed by the user';
}
