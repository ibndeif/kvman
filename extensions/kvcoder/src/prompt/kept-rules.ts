import { createHash } from 'node:crypto';
import type { Ctx, Stored } from '@kvman/sdk';
import { ownerName } from '../jobs/process-records.ts';
import type { SessionDoc } from '../schemas/records.ts';
import type { KeptRule } from '../schemas/kept-rule.ts';
import { txRecords } from '../store/collections.ts';
import { appendMessage, userContent } from '../turns/history.ts';
import { liveStep } from '../turns/step-intents.ts';
import type { StepLease } from '../turns/step-claim.ts';
import { readRules, ruleText } from './project-rules.ts';

// A chat keeps its rule files' text for its life (plan 08 §8.2, ADR 0108, 6), so its system prompt doesn't change and
// the provider's cache holds. A kept file whose text later differs is told once, as a message, with its current text.

const hashOf = (text: string): string => createHash('sha256').update(text).digest('hex');
const gone = 'gone';

/** What the chat is told of a kept file that changed: its current text, or that it no longer exists. */
function changedText(rule: KeptRule, now: string | undefined): string {
  const head = `[kvman: ${rule.path} changed since this chat started.`;
  return now === undefined ? `${head} It no longer exists.]` : `${head} Its current text:]\n${now}`;
}

/** At a step's start: keeps the rule files of a chat that has none kept yet, else tells it once of each that changed. */
export async function keepRules(ctx: Ctx, session: Stored<SessionDoc>, lease: StepLease): Promise<void> {
  const workspace = ctx.job.workspace.path;
  if (session.rules === undefined) {
    const rules = await readRules(workspace);
    await ctx.store.transaction((tx) => {
      const live = liveStep(txRecords(tx), lease, lease.jobId);
      if (live !== undefined && live.session.rules === undefined) txRecords(tx).sessions.update(session.id, { rules });
    });
    return;
  }
  const kept = session.rules;
  const now = await Promise.all(kept.map((rule) => ruleText(workspace, rule.path)));
  const changed = kept.flatMap((rule, index) => {
    const text = now[index];
    const told = text === undefined ? gone : hashOf(text);
    return text === rule.content || told === rule.told ? [] : [{ index, told, message: changedText(rule, text) }];
  });
  if (changed.length === 0) return;
  await ctx.store.transaction((tx) => {
    const store = txRecords(tx);
    const live = liveStep(store, lease, lease.jobId);
    if (live === undefined) return;
    const rules = kept.map((rule, index) => ({ ...rule, told: changed.find((entry) => entry.index === index)?.told ?? rule.told }));
    store.sessions.update(session.id, { rules });
    appendMessage(store, store.sessions.get(session.id) ?? live.session, { kind: 'user', content: userContent(changed.map((entry) => entry.message).join('\n\n')), turnId: lease.turnId, source: { kind: 'extension', name: ownerName } });
  });
}
