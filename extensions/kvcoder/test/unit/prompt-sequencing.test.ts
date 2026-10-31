import { describe, expect, it } from 'vitest';
import { executionMapDescription } from '../../src/connectors/execution-map.ts';
import { workingMethod } from '../../src/prompt/working-method.ts';

// Work that needs a worker's answer waits for it, and a quick look answers what it can (plan 08 §8.2, ADR 0114, 2 and 5).

const lineOf = (method: string, start: string): string => method.split('\n').find((line) => line.startsWith(start)) ?? '';

describe("a worker's answer comes first, and a quick look answers (08 §8.2, ADR 0114)", () => {
  it("QA75-H3 the lead starts what needs a worker's answer only once it arrives", () => {
    expect(lineOf(workingMethod('lead'), 'Delegate. ')).toContain("after starting workers, go on with what doesn't need them or end your turn, and start what needs a worker's answer once it arrives;");
  });

  it('QA75-H4 what one quick look would answer is looked up, for the lead and workers', () => {
    for (const role of ['lead', 'worker'] as const) {
      for (const method of ['engineering', 'general'] as const) {
        expect(workingMethod(role, method).split('\n'), `${role} ${method}`).toContain('Decide from evidence: every decision and every claim rests on something you read, ran, or were told; what one quick look would answer, look up instead of leaving it open.');
      }
    }
  });

  it('QA75-H5 the map entry says a new goal starts a new map', () => {
    expect(executionMapDescription).toContain('A new request is a new goal, and a new goal starts a new map: every step starts todo, with only the details you give.');
  });
});
