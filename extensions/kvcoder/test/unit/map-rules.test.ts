import { describe, expect, it } from 'vitest';
import { mapDocSchema } from '../../src/maps/map-schema.ts';
import { changedSteps, mapProgress, plannedSteps, readySteps, shapeProblem, type PlannedStep } from '../../src/maps/map-rules.ts';

const step = (id: string, after: string[] = []): PlannedStep => ({ id, title: `Do ${id}`, after, check: `check ${id}` });
const diamond = [step('read'), step('store', ['read']), step('page', ['read']), step('test', ['store', 'page'])];
const fresh = () => plannedSteps(diamond, []).map((planned) => ({ ...planned, details: `How ${planned.id} is done` }));
const evidence = 'pnpm test passed, 12 of 12';
const storedMap = (fields: Record<string, string>) => ({
  sessionId: 's1',
  goal: 'Ship it',
  steps: [{ id: 'read', title: 'Do read', ...fields, after: [], uses: null, check: 'check read', status: 'todo', evidence: null, note: null }],
  notes: [],
  version: 1,
  createdAt: '2026-10-01T09:00:00.000Z',
  updatedAt: '2026-10-01T09:00:00.000Z',
});

describe('the rules of an execution map (ADR 0064, 2, 3, and 5)', () => {
  it('M2.4-E218 a map with a wrong shape is refused by name, and a valid one gives its ready steps', () => {
    expect(shapeProblem([step('a'), step('a')])).toBe('Two steps have the id a. Give each step its own id.');
    expect(shapeProblem([step('a', ['b'])])).toBe('The step a comes after b, which is not a step of the map.');
    expect(shapeProblem([step('a', ['a'])])).toBe("The step a can't come after itself.");
    expect(shapeProblem([step('a', ['c']), step('b', ['a']), step('c', ['b']), step('d')])).toBe('These steps wait on each other in a circle, so none can start: a, b, c.');
    expect(shapeProblem(diamond)).toBeUndefined();
    expect(readySteps(fresh()).map((found) => found.id)).toEqual(['read']);
    expect(mapProgress({ goal: 'Ship', steps: fresh(), notes: [] })).toEqual({ goal: 'Ship', progress: '0 of 4 done', doing: [], ready: ['read: Do read'], waiting: ['store: Do store', 'page: Do page', 'test: Do test'], failed: [], undetailed: [], notes: 0 });
  });

  it('M2.4-E219 a change of status needs its order, its evidence, or its note, and a refused batch changes nothing', () => {
    expect(changedSteps(fresh(), [{ id: 'store', status: 'doing' }])).toBe("store can't be doing yet: it comes after read, which is not finished.");
    expect(changedSteps(fresh(), [{ id: 'test', status: 'done', evidence }])).toBe("test can't be done yet: it comes after store, page, which are not finished.");
    expect(changedSteps(fresh(), [{ id: 'read', status: 'done' }])).toBe('read needs evidence to be done: say what you ran or checked and what it showed.');
    expect(changedSteps(fresh(), [{ id: 'read', status: 'failed' }])).toBe('read needs a note that says why it failed.');
    expect(changedSteps(fresh(), [{ id: 'read', status: 'skipped' }])).toBe('read needs a note that says why it is skipped.');
    expect(changedSteps(fresh(), [{ id: 'nope', status: 'doing' }])).toBe('The map has no step nope. Its steps are: read, store, page, test.');
    expect(changedSteps(fresh(), [{ id: 'read', status: 'done', evidence }, { id: 'store', status: 'done' }])).toBe('store needs evidence to be done: say what you ran or checked and what it showed.');
    const done = changedSteps(fresh(), [{ id: 'read', status: 'doing' }, { id: 'read', status: 'done', evidence }, { id: 'store', status: 'skipped', note: 'Not needed.' }]);
    if (typeof done === 'string') throw new Error(done);
    expect(done.map((found) => [found.id, found.status, found.evidence, found.note])).toEqual([['read', 'done', evidence, null], ['store', 'skipped', null, 'Not needed.'], ['page', 'todo', null, null], ['test', 'todo', null, null]]);
    expect(readySteps(done).map((found) => found.id)).toEqual(['page']);
    const again = changedSteps(done, [{ id: 'read', status: 'todo' }]);
    if (typeof again === 'string') throw new Error(again);
    expect(again[0]).toMatchObject({ status: 'todo', evidence: null, note: null });
  });

  it('QA54-H7 a step stored with a description is read with it as details, and saved under the new name', () => {
    const parsed = mapDocSchema.parse(storedMap({ description: 'Read it.' }));
    expect(parsed.steps[0]).toMatchObject({ id: 'read', details: 'Read it.' });
    expect(parsed.steps[0]).not.toHaveProperty('description');
    expect(plannedSteps([step('read')], parsed.steps)[0]?.details).toBe('Read it.');
  });

  it('QA54-E8 a step stored before ADR 0072 is read with no details, and a new step starts with none', () => {
    expect(mapDocSchema.parse(storedMap({})).steps.map((found) => found.details)).toEqual([null]);
    expect(plannedSteps(diamond, []).map((found) => found.details)).toEqual([null, null, null, null]);
  });
});
