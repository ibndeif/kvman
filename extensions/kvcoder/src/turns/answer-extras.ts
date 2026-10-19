import { z, type Ctx, type Json } from '@kvman/sdk';
import { builtinConnectors } from '../connector-call.ts';
import { invalid } from '../problems.ts';
import { approvalRuleSchema, type ApprovalRule } from '../schemas/approval-rule.ts';
import { runCallSchema, type QuestionDoc } from '../schemas/records.ts';

// What an approval's answer may carry besides the decision (plan 08 §8.6, ADR 0091, 3 and 4): a rule to remember with
// an allowed call, or the reason for a denied one.

export const answerExtrasShape = {
  remember: approvalRuleSchema.exactOptional(),
  reason: z.string().trim().min(1).max(1000).exactOptional(),
};

export type AnswerExtras = { remember?: ApprovalRule | undefined; reason?: string | undefined };

const fileChanges = new Set(['write', 'edit', 'undo', 'assemble']);
const confirmedOf = (answer: Json): unknown => (typeof answer === 'object' && answer !== null && !Array.isArray(answer) ? answer['confirmed'] : undefined);

// Whether a rule of this kind could cover the approval's call: a line for a shell or binary line, files for a file change.
function fits(rule: ApprovalRule, question: QuestionDoc): boolean {
  const call = runCallSchema.safeParse(question.question);
  if (!call.success) return false;
  const { connector, command } = call.data;
  if (rule.kind === 'files') return connector === 'fs' && fileChanges.has(command);
  return command === 'exec' && (connector === 'shell' || !builtinConnectors.some((name) => name === connector));
}

/** Refuses extras that don't belong to the question and its answer, before anything is saved. */
export function checkExtras(question: QuestionDoc, answer: Json, extras: AnswerExtras): void {
  if (extras.remember === undefined && extras.reason === undefined) return;
  if (question.kind !== 'approval') throw invalid('remember and reason belong to the answer of an approval.');
  if (extras.remember !== undefined && (confirmedOf(answer) !== true || !fits(extras.remember, question))) throw invalid('remember goes with an allowed call that a rule of its kind could cover.');
  if (extras.reason !== undefined && confirmedOf(answer) !== false) throw invalid('reason goes with a denied call.');
}

const sameRule = (first: ApprovalRule, second: ApprovalRule): boolean => first.kind === second.kind && (first.kind === 'files' || (second.kind === 'line' && first.prefix.replace(/\s+/g, ' ') === second.prefix.replace(/\s+/g, ' ')));

/** Adds the rule to this workspace's approval rules, unless one like it is there (ADR 0091, 3). */
export async function rememberRule(ctx: Ctx, rule: ApprovalRule): Promise<void> {
  const rules = z.array(approvalRuleSchema).parse(await ctx.settings.get('kvcoder.approval.allowed'));
  if (rules.some((saved) => sameRule(saved, rule))) return;
  await ctx.settings.set('kvcoder.approval.allowed', [...rules, rule], { scope: 'workspace' });
}
