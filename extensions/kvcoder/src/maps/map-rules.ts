import type { MapDoc, MapStatus, MapStep } from './map-schema.ts';

// The rules of an execution map (ADR 0064, 2, 3, 5, and 6), with no store: what makes a map's shape valid, which steps
// are ready, what a change of status needs, and what the agent reads back. A refusal is the sentence the model reads.

/** A step as `set` names it. */
export type PlannedStep = { id: string; title: string; description: string; after?: string[] | undefined; uses?: string | undefined; check: string };

/** One change of `update`. */
export type StepChange = { id: string; status: MapStatus; evidence?: string | undefined; note?: string | undefined };

const finished = (step: MapStep): boolean => step.status === 'done' || step.status === 'skipped';

function circle(steps: readonly PlannedStep[]): string[] {
  const waiting = new Map(steps.map((step) => [step.id, new Set(step.after ?? [])]));
  for (let cleared = true; cleared; ) {
    cleared = false;
    for (const [id, after] of waiting) {
      if (after.size > 0) continue;
      waiting.delete(id);
      for (const others of waiting.values()) others.delete(id);
      cleared = true;
    }
  }
  return [...waiting.keys()];
}

/** What is wrong with a map's shape, or nothing. */
export function shapeProblem(steps: readonly PlannedStep[]): string | undefined {
  const ids = steps.map((step) => step.id);
  const twice = ids.find((id, index) => ids.indexOf(id) !== index);
  if (twice !== undefined) return `Two tasks have the id ${twice}. Give each task its own id.`;
  for (const step of steps) {
    const unknown = (step.after ?? []).find((id) => !ids.includes(id));
    if ((step.after ?? []).includes(step.id)) return `The task ${step.id} can't come after itself.`;
    if (unknown !== undefined) return `The task ${step.id} comes after ${unknown}, which is not a task of the map.`;
  }
  const stuck = circle(steps);
  return stuck.length === 0 ? undefined : `These tasks wait on each other in a circle, so none can start: ${stuck.join(', ')}.`;
}

/** The steps of a new map: one whose id the old map had keeps how far it got. */
export function plannedSteps(planned: readonly PlannedStep[], old: readonly MapStep[]): MapStep[] {
  return planned.map((step) => {
    const kept = old.find((candidate) => candidate.id === step.id);
    return { id: step.id, title: step.title, description: step.description, after: step.after ?? [], uses: step.uses ?? null, check: step.check, status: kept?.status ?? 'todo', evidence: kept?.evidence ?? null, note: kept?.note ?? null };
  });
}

const unfinishedBefore = (steps: readonly MapStep[], step: MapStep): string[] => step.after.filter((id) => steps.find((candidate) => candidate.id === id)?.status !== 'done' && steps.find((candidate) => candidate.id === id)?.status !== 'skipped');

function changed(steps: readonly MapStep[], step: MapStep, change: StepChange): MapStep | string {
  if (change.status === 'todo') return { ...step, status: 'todo', evidence: null, note: null };
  const note = change.note ?? step.note;
  if (change.status === 'failed' || change.status === 'skipped') {
    return change.note === undefined ? `${step.id} needs a note that says why it ${change.status === 'failed' ? 'failed' : 'is skipped'}.` : { ...step, status: change.status, note };
  }
  const before = unfinishedBefore(steps, step);
  if (before.length > 0) return `${step.id} can't be ${change.status} yet: it comes after ${before.join(', ')}, which ${before.length === 1 ? 'is' : 'are'} not finished.`;
  if (change.status === 'doing') return { ...step, status: 'doing', note };
  return change.evidence === undefined ? `${step.id} needs evidence to be done: say what you ran or checked and what it showed.` : { ...step, status: 'done', evidence: change.evidence, note };
}

/** The steps after the changes, applied in order, or the first refusal: then nothing changes. */
export function changedSteps(steps: readonly MapStep[], changes: readonly StepChange[]): MapStep[] | string {
  let current = [...steps];
  for (const change of changes) {
    const index = current.findIndex((step) => step.id === change.id);
    const step = current[index];
    if (step === undefined) return `The map has no task ${change.id}. Its tasks are: ${current.map((candidate) => candidate.id).join(', ')}.`;
    const next = changed(current, step, change);
    if (typeof next === 'string') return next;
    current = current.with(index, next);
  }
  return current;
}

/** The steps that can start now: not started, with everything before them finished. */
export const readySteps = (steps: readonly MapStep[]): MapStep[] => steps.filter((step) => step.status === 'todo' && unfinishedBefore(steps, step).length === 0);

const named = (steps: readonly MapStep[]): string[] => steps.map((step) => `${step.id}: ${step.title}`);

/** What the agent reads after every change (ADR 0064, 6): where the work is, and what can start. */
export function mapProgress(map: Pick<MapDoc, 'goal' | 'steps' | 'notes'>) {
  const ready = readySteps(map.steps);
  return {
    goal: map.goal,
    progress: `${map.steps.filter(finished).length} of ${map.steps.length} done`,
    doing: named(map.steps.filter((step) => step.status === 'doing')),
    ready: named(ready),
    waiting: named(map.steps.filter((step) => step.status === 'todo' && !ready.includes(step))),
    failed: named(map.steps.filter((step) => step.status === 'failed')),
    notes: map.notes.length,
  };
}
