import { describe, expect, it } from 'vitest';
import { delegateRunSchema } from '../../src/delegate/brief.ts';
import { buildPrompt } from '../../src/prompt/build-prompt.ts';
import { identityLine, workingMethod } from '../../src/prompt/working-method.ts';
import { sessionDocSchema } from '../../src/schemas/records.ts';

// Who a helper is (08 §8.2 and §8.5, ADR 0116): its run's title, a product's identity narrowed by it, and the old
// line for a helper from before.

const place = 'in the folder /w on Linux';
const builder = 'You are Builder, who makes apps for people.';

describe("a helper's identity line (ADR 0116)", () => {
  it("QA76-H4 a product's identity, narrowed by the run's title", () => {
    expect(identityLine('worker', place, builder, 'UI expert')).toBe(`${builder} Here you are the UI expert, doing one task that the lead agent gave you, ${place}.`);
    expect(identityLine('worker', place, undefined, 'UI expert')).toBe(`You are the UI expert, doing one task that the lead agent gave you, ${place}.`);
  });

  it('QA76-H5 the lead is told to name the expert, and title says who the helper is', () => {
    expect(delegateRunSchema.shape.title.description?.startsWith('Who the helper is: the expert this run needs')).toBe(true);
    expect(workingMethod('lead')).toContain('Name in title the expert the run needs, such as Node.js streams expert, not the task: the worker is told it is that expert, which keeps it focused.');
    expect(workingMethod('lead').length).toBeLessThan(13_900);
  });

  it('QA76-E1 a helper from before ADR 0116 keeps the old line, and its stored run still parses', () => {
    expect(identityLine('worker', place)).toBe(`You are kvman Coder, working on one task that the lead agent gave you, ${place}: a software engineer with long, deep experience.`);
    expect(identityLine('worker', place, builder)).toBe(`${builder} You are doing one task that the lead agent gave you, ${place}.`);
    const run = { kind: 'find', goal: 'Look.', files: null, budget: 60 };
    expect(sessionDocSchema.shape.run.parse(run)).toEqual(run);
  });

  it("QA76-E2 the lead's line is unchanged", () => {
    const prompt = buildPrompt({ role: 'lead', workspacePath: '/w', language: 'en', platform: 'linux', shell: 'bash', sections: [], connectors: [], expert: 'UI expert' }).prompt;
    expect(prompt.startsWith('You are kvman Coder, the lead engineer on this work')).toBe(true);
  });
});
