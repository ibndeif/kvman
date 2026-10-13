import type { Ctx } from '@kvman/sdk';
import type { RunCall } from '../calls/run-tool.ts';
import { records } from '../store/collections.ts';

// The reminder that keeps a map live (plan 08 §8.5; ADR 0074, 6 and 7): a reply of the chat's own agent that changed
// something while the map has tasks left and none marked doing is told so, once, and nothing is refused.

const changes: ReadonlySet<string> = new Set(['fs write', 'fs edit', 'shell exec']);
const tends: ReadonlySet<string> = new Set(['execution-map set', 'execution-map update']);
const named = (call: RunCall): string => `${call.connector} ${call.command}`;

/** The reply's last change that ran and succeeded, by its place, or nothing when the reply has none or tends the map itself. */
export function lastChange(calls: readonly (RunCall | undefined)[], succeeded: readonly boolean[]): number | undefined {
  if (calls.some((call) => call !== undefined && tends.has(named(call)))) return undefined;
  const index = calls.findLastIndex((call, place) => call !== undefined && changes.has(named(call)) && succeeded[place] === true);
  return index === -1 ? undefined : index;
}

/** The line a change's result ends with, or nothing when the chat's map needs no reminder. */
export async function mapReminder(ctx: Ctx, chatId: string): Promise<string | undefined> {
  const [map] = await records(ctx.store).maps.find({ sessionId: chatId }, { limit: 1 });
  if (map === undefined || map.steps.some((step) => step.status === 'doing')) return undefined;
  const left = map.steps.filter((step) => step.status === 'todo' || step.status === 'failed').length;
  if (left === 0) return undefined;
  return `\n\n[kvman: the execution map has ${left} unfinished ${left === 1 ? 'task' : 'tasks'} and none is marked doing. Mark the task this work belongs to with execution-map update, or set the map again when the plan changed.]`;
}
