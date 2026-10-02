import { z } from '@kvman/sdk';
import { builtinHelp, callInput, errorOutput, jsonOutput, type CallResult } from '../connector-line.ts';
import { invalidInput } from './invalid-input.ts';
import type { JsonValue } from '../connector-line.ts';
import { invalid } from '../problems.ts';
import { resultText } from '../result-text.ts';
import type { QuestionDoc } from '../schemas/records.ts';

// The `ask` connector (plan 08 §8.5): a question suspends the turn until the person answers; the answer becomes the
// call's result, and a dismissal gives `{ "dismissed": true }`. Answers are checked (ADR 0009, 102).

const prompt = z.string().min(1);

export const askSchemas = {
  text: z.strictObject({ prompt, placeholder: z.string().exactOptional() }),
  choice: z.strictObject({
    prompt,
    multiple: z.boolean(),
    options: z
      .array(z.strictObject({ id: z.string().min(1), label: z.string().min(1), description: z.string().exactOptional() }))
      .min(2)
      .max(10)
      .refine((options) => new Set(options.map((option) => option.id)).size === options.length, 'Option ids must differ.'),
    other: z.boolean().exactOptional(),
  }),
  confirm: z.strictObject({ prompt, danger: z.boolean().exactOptional() }),
};

export type QuestionKind = QuestionDoc['kind'];

/** An `ask` call: the question to put to the person, or what the call printed instead. */
export function askCall(words: readonly string[], stdin: string | null): { kind: QuestionKind; question: Record<string, JsonValue> } | CallResult {
  if (words.length === 1 && words[0] === '-h') return { output: builtinHelp.ask, exitCode: 0 };
  const call = callInput(words, stdin, 'ask');
  if ('output' in call) return call;
  const kind = call.command;
  if (kind !== 'text' && kind !== 'choice' && kind !== 'confirm') return errorOutput({ code: 'NOT_FOUND', message: `ask has no command ${kind}; run \`ask -h\`.` });
  const parsed = askSchemas[kind].safeParse(call.input);
  if (!parsed.success) return invalidInput('ask', kind, parsed.error.issues);
  return { kind, question: call.input };
}

const dismissedSchema = z.strictObject({ dismissed: z.literal(true) });

const answerSchemas = {
  text: z.strictObject({ text: z.string() }),
  choice: z.strictObject({ selected: z.array(z.string()), other: z.string().exactOptional() }),
  confirm: z.strictObject({ confirmed: z.boolean() }),
  approval: z.strictObject({ confirmed: z.boolean() }),
};

function checkChoice(question: Record<string, JsonValue>, answer: { selected: string[]; other?: string | undefined }): void {
  const parsed = askSchemas.choice.parse(question);
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
  if (dismissed.success) return { kind: 'result', text: resultText(jsonOutput({ dismissed: true }).output, 0) };
  const parsed = answerSchemas[question.kind].safeParse(answer);
  if (!parsed.success) throw invalid(`The answer doesn't fit a ${question.kind} question.`);
  if ('selected' in parsed.data) checkChoice(question.question, parsed.data);
  return { kind: 'result', text: resultText(jsonOutput(parsed.data).output, 0) };
}

/** What a question, or an approval, dismissed by a message returns to the model (plan 08 §8.1). */
export function dismissedText(kind: QuestionKind): string {
  return kind === 'approval' ? 'denied by the user' : 'dismissed by the user';
}
