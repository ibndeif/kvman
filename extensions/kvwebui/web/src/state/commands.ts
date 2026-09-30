import type { Json, Problem } from '@kvman/sdk';
import { failedJobId, problemOf } from '../api/client.ts';
import { applyEffects } from './effects.ts';
import type { Kvwebui } from './kvwebui.ts';

// Commands the UI runs (plan 06 §6.3–§6.5): a success reruns the page's queries and the status items; `after` handles
// the outcome (a `then`, or the error toast); then the job's effects apply, in success or failure (ADR 0009, 86).

export type CommandOutcome = { ok: true; output: Json } | { ok: false; problem: Problem };

type Ended = { outcome: CommandOutcome; jobId: string | undefined };

export async function runCommand(state: Kvwebui, name: string, input: unknown, after: (outcome: CommandOutcome) => void | Promise<void>): Promise<CommandOutcome> {
  const { outcome, jobId } = await state.api.command(name, input).then(
    (ran): Ended => ({ outcome: { ok: true, output: ran.output }, jobId: ran.jobId }),
    (error: unknown): Ended => ({ outcome: { ok: false, problem: problemOf(error) }, jobId: failedJobId(error) }),
  );
  if (outcome.ok) state.revision.value += 1;
  await after(outcome);
  if (jobId !== undefined) await applyEffects(state, jobId);
  return outcome;
}
