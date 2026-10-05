import { z, type Ctx } from '@kvman/sdk';
import { jsonOutput, type JsonValue } from '../connector-call.ts';
import { invalid } from '../problems.ts';
import { callInput, payloads } from '../schemas/payloads.ts';
import type { QuestionDoc } from '../schemas/records.ts';
import { builtinCommands } from './builtin-connectors.ts';

// The `ask` connector (plan 08 §8.5): a question suspends the turn until the person answers; the answer becomes the
// call's result, and a dismissal gives `{ "dismissed": true }`. Each command's check validates its payload as a kernel
// job, and the step then records the question (ADR 0011, 9). Answers are checked (ADR 0009, 102).

export type QuestionKind = QuestionDoc['kind'];

/** The kinds of question the agent asks: the `ask` connector's commands. */
export const askKinds = ['text', 'choice', 'confirm'] as const;

export const isAskKind = (command: string): command is (typeof askKinds)[number] => askKinds.some((kind) => kind === command);

const noOutput = z.object({});

export function registerAskConnector(ctx: Ctx): void {
  ctx.registerCommand('kvcoder.ask.text.check', { description: builtinCommands.ask.text.description, input: callInput(payloads.askText), output: noOutput, retries: 0, handle: () => ({}) });
  ctx.registerCommand('kvcoder.ask.choice.check', { description: builtinCommands.ask.choice.description, input: callInput(payloads.askChoice), output: noOutput, retries: 0, handle: () => ({}) });
  ctx.registerCommand('kvcoder.ask.confirm.check', { description: builtinCommands.ask.confirm.description, input: callInput(payloads.askConfirm), output: noOutput, retries: 0, handle: () => ({}) });
}

const dismissedSchema = z.strictObject({ dismissed: z.literal(true) });

const answerSchemas = {
  text: z.strictObject({ text: z.string() }),
  choice: z.strictObject({ selected: z.array(z.string()), other: z.string().exactOptional() }),
  confirm: z.strictObject({ confirmed: z.boolean() }),
  approval: z.strictObject({ confirmed: z.boolean() }),
};

function checkChoice(question: Record<string, JsonValue>, answer: { selected: string[]; other?: string | undefined }): void {
  const parsed = payloads.askChoice.parse(question);
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
