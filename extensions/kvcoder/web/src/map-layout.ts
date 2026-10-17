// Where an execution map's steps sit in its diagram (plan 08 §8.7, ADR 0064): a row per stage, top to bottom, where a
// step's stage is one past the latest stage it waits on, so the steps of one row can run together. Positions are from
// the diagram's inline start, which the page mirrors in a right-to-left language.

export type MapStatus = 'todo' | 'doing' | 'done' | 'failed' | 'skipped';
export type MapStep = { id: string; title: string; details: string | null; after: string[]; uses: string | null; check: string; status: MapStatus; evidence: string | null; note: string | null };
export type ExecutionMapView = { goal: string; steps: MapStep[]; notes: { text: string; createdAt: string }[]; version: number; updatedAt: string };

/** A step's width when the diagram isn't told how wide it may be, and the least and most it takes to fit. */
export const nodeWidth = 148;
const narrowest = 104;
const widest = 172;
export const nodeHeight = 62;
const gapAcross = 12;
const gapDown = 34;
// The room an arrow takes in a row it only passes through.
const laneWidth = 14;

export type PlacedStep = { step: MapStep; x: number; y: number };
export type MapEdge = { from: string; to: string; path: string; reached: boolean };
export type MapLayout = { width: number; height: number; stepWidth: number; nodes: PlacedStep[]; edges: MapEdge[] };

/** Whether nothing more is to do on a step. */
export const finished = (step: MapStep): boolean => step.status === 'done' || step.status === 'skipped';

function stages(steps: readonly MapStep[]): Map<string, number> {
  const byId = new Map(steps.map((step) => [step.id, step]));
  const found = new Map<string, number>();
  // A stored map has no circle; a step met again on its own path still gets a stage, so a bad one draws.
  const stageOf = (step: MapStep, path: ReadonlySet<string>): number => {
    const known = found.get(step.id);
    if (known !== undefined) return known;
    const before = step.after.flatMap((id) => (path.has(id) ? [] : [byId.get(id)])).filter((candidate) => candidate !== undefined);
    const stage = before.length === 0 ? 0 : Math.max(...before.map((candidate) => stageOf(candidate, new Set([...path, step.id])))) + 1;
    found.set(step.id, stage);
    return stage;
  };
  for (const step of steps) stageOf(step, new Set());
  return found;
}

// What a row holds: a step, or the lane of an arrow that passes through the row on its way to a later one.
type Slot = { key: string; step?: MapStep; above: string[]; width: number };
type Placed = { x: number; y: number; width: number };

const lanesKey = (from: string, to: string, row: number): string => `${from}>${to}#${row}`;

function slotRows(steps: readonly MapStep[], stage: ReadonlyMap<string, number>): Slot[][] {
  // A step's width is set once the rows are known: a step's slot is marked by its step.
  const rows: Slot[][] = [];
  const add = (row: number, slot: Slot): void => void (rows[row] ??= []).push(slot);
  for (const step of steps) {
    const row = stage.get(step.id) ?? 0;
    const above = step.after.filter((id) => stage.has(id)).map((id) => ((stage.get(id) ?? 0) < row - 1 ? lanesKey(id, step.id, row - 1) : id));
    add(row, { key: step.id, step, above, width: 0 });
    for (const id of step.after) {
      const start = stage.get(id);
      if (start === undefined) continue;
      for (let lane = start + 1; lane < row; lane += 1) add(lane, { key: lanesKey(id, step.id, lane), above: [lane === start + 1 ? id : lanesKey(id, step.id, lane - 1)], width: laneWidth });
    }
  }
  return rows.map((row) => row ?? []);
}

const middleOf = (placed: Placed): number => placed.x + placed.width / 2;

// A row keeps each slot under the middle of what it comes from, so arrows cross less.
function ordered(row: readonly Slot[], placed: ReadonlyMap<string, Placed>): Slot[] {
  const under = (slot: Slot): number => {
    const above = slot.above.flatMap((key) => (placed.get(key) === undefined ? [] : [middleOf(placed.get(key) ?? { x: 0, y: 0, width: 0 })]));
    return above.length === 0 ? Number.POSITIVE_INFINITY : above.reduce((sum, x) => sum + x, 0) / above.length;
  };
  return row.map((slot, index) => ({ slot, index, at: under(slot) })).sort((first, second) => first.at - second.at || first.index - second.index).map((entry) => entry.slot);
}

const rowWidth = (row: readonly Slot[]): number => row.reduce((sum, slot) => sum + slot.width, 0) + Math.max(row.length - 1, 0) * gapAcross;

// From the bottom of one slot to the top of the next, bending halfway; a lane is crossed straight down.
function edgePath(points: readonly Placed[]): string {
  const [first, ...rest] = points;
  if (first === undefined) return '';
  let path = `M ${middleOf(first)} ${first.y + nodeHeight}`;
  let from = first;
  for (const [index, to] of rest.entries()) {
    const bend = (from.y + nodeHeight + to.y) / 2;
    path += ` C ${middleOf(from)} ${bend}, ${middleOf(to)} ${bend}, ${middleOf(to)} ${to.y}`;
    if (index < rest.length - 1) path += ` L ${middleOf(to)} ${to.y + nodeHeight}`;
    from = to;
  }
  return path;
}

// The widest steps that let every row fit in `available`, within what a title needs and what looks right.
function fittingWidth(rows: readonly Slot[][], available: number | undefined): number {
  if (available === undefined) return nodeWidth;
  const fits = rows.map((row) => {
    const stepsInRow = row.filter((slot) => slot.step !== undefined).length;
    const taken = (row.length - stepsInRow) * laneWidth + Math.max(row.length - 1, 0) * gapAcross;
    return stepsInRow === 0 ? widest : Math.floor((available - taken) / stepsInRow);
  });
  return Math.min(widest, Math.max(narrowest, ...(fits.length === 0 ? [widest] : [Math.min(...fits)])));
}

/** The diagram of a map's steps, as wide as `available` when it is given: each step's place, and an arrow from every step to the ones that wait on it. */
export function layoutMap(steps: readonly MapStep[], available?: number): MapLayout {
  const stage = stages(steps);
  const unsized = slotRows(steps, stage);
  const stepWidth = fittingWidth(unsized, available);
  const rows = unsized.map((row) => row.map((slot) => (slot.step === undefined ? slot : { ...slot, width: stepWidth })));
  const width = Math.max(stepWidth, ...rows.map(rowWidth));
  const placed = new Map<string, Placed>();
  rows.forEach((row, rowIndex) => {
    let x = (width - rowWidth(row)) / 2;
    for (const slot of ordered(row, placed)) {
      placed.set(slot.key, { x, y: rowIndex * (nodeHeight + gapDown), width: slot.width });
      x += slot.width + gapAcross;
    }
  });
  const nodes = steps.flatMap((step) => {
    const at = placed.get(step.id);
    return at === undefined ? [] : [{ step, x: at.x, y: at.y }];
  });
  const edges = steps.flatMap((to) => to.after.flatMap((id) => {
    const from = steps.find((step) => step.id === id);
    const start = stage.get(id);
    const end = stage.get(to.id);
    if (from === undefined || start === undefined || end === undefined) return [];
    const keys = [id, ...Array.from({ length: Math.max(end - start - 1, 0) }, (_lane, index) => lanesKey(id, to.id, start + 1 + index)), to.id];
    const points = keys.flatMap((key) => (placed.get(key) === undefined ? [] : [placed.get(key)])).filter((point) => point !== undefined);
    return [{ from: id, to: to.id, path: edgePath(points), reached: finished(from) }];
  }));
  return { width, height: rows.length * nodeHeight + Math.max(rows.length - 1, 0) * gapDown, stepWidth, nodes, edges };
}

/** How many of a map's steps are finished, and how many are left. */
export function mapCounts(steps: readonly MapStep[]): { done: number; total: number; left: number } {
  const done = steps.filter(finished).length;
  return { done, total: steps.length, left: steps.length - done };
}
