import { describe, expect, it } from 'vitest';
import { runTool } from '../../src/calls/run-tool.ts';
import { executionMapDescription } from '../../src/connectors/execution-map.ts';
import { workingMethod } from '../../src/prompt/working-method.ts';

const lines = (text: string): string[] => text.split('\n');
const starts = (text: string): string[] => lines(text).map((line) => line.slice(0, line.indexOf('. ')));

describe('a turn in few steps (08 §8.2, ADR 0097, 1)', () => {
  it('QA65-H1 independent calls come first in both methods, the lead talks next with an example, and run says it too', () => {
    const lead = workingMethod('lead');
    const worker = workingMethod('worker');
    expect(starts(lead).slice(0, 4)).toEqual(['How you work', 'Work in few steps', 'Talk to the person as you work, the way a colleague thinks aloud', 'Size up the task first']);
    expect(starts(worker).slice(0, 3)).toEqual(['How you work', 'Work in few steps', '1']);
    expect(starts(workingMethod('lead', 'general')).slice(0, 3)).toEqual(['How you work', 'Work in few steps', 'Talk to the person as you work, the way a colleague thinks aloud']);
    for (const method of [lead, worker]) {
      expect(method).toContain('Each reply is a step, and every step sends the whole conversation again, so make in one reply every call you can make now');
      expect(method).toContain('Read a few files with one `fs read-files`');
      expect(lines(method).filter((line) => line.startsWith('Work in few steps'))).toHaveLength(1);
    }
    expect(lead).toContain('A good reply reads like this: "The totals are off because two months are missing from the sheet; reading both months\' files now." with, in that same reply, one `fs read-files` call for the two files.');
    expect(worker).not.toContain('Talk to the person as you work');
    expect(runTool(['fs']).description).toContain('Make every independent call in the same reply, as several run calls');
  });
});

describe("the map's rules in its entry (08 §8.2 and §8.5, ADR 0097, 5 and 8)", () => {
  it('QA65-H10 Plan and Execute are short and point to the entry, which holds the rules of a map', () => {
    const lead = lines(workingMethod('lead'));
    const plan = lead.find((line) => line.startsWith('Plan.')) ?? '';
    const execute = lead.find((line) => line.startsWith('Execute.')) ?? '';
    // Superseded by QA67-H9 (ADR 0102, 4).
    expect(plan).toContain("the `execution-map` entry below says how to set it with its steps' details in one call, and keep it true.");
    expect(execute).toContain('work through it as its entry says');
    // ADR 0102, 2 adds the checks in proportion to Execute.
    expect(plan.length + execute.length).toBeLessThan(1900);
    for (const rule of ['Its uses names who does it', 'a branch means delegation', 'Give each step its details in the same set call', 'Setting the map again keeps the status of each step whose id stays', 'Mark a step doing in the same reply as your first call on it', 'failed with a note']) expect(executionMapDescription).toContain(rule);
  });

  it('QA65-H13 the entry gives every limit as the schemas have them', () => {
    expect(executionMapDescription).toContain('Limits: goal up to 300 characters; 1 to 40 steps; a step\'s id lowercase kebab case up to 50, title up to 100, uses one name up to 60 or a list of up to 5, check up to 300, and details up to 4,000; a step\'s evidence 10 to 500 and its note up to 300; a note of note up to 500.');
    expect(executionMapDescription).not.toContain('evidence and a note up to 500');
  });
});

describe('Decide for me asks nothing (08 §8.2, ADR 0097, 7)', () => {
  it('QA65-H12 Clarify decides, Confirm the plan starts, no ask rule, and the general method decides', () => {
    const lead = workingMethod('lead', 'engineering', true);
    expect(lead).toContain('Anything else, decide yourself, since the person asked you to decide: choose what you would recommend, and say in a line what you chose and why.');
    expect(lead).toContain("Confirm the plan. Once every step of the map has details, say in a few lines what you understood (the goal, what done looks like, what stays as it is, and the choices you made for the person) and start: the person asked you to decide, so don't wait for an answer.");
    expect(lead).not.toContain('call `ask');
    expect(lead).not.toContain('`ask choice`');
    const general = workingMethod('lead', 'general', true);
    expect(general).toContain('decide it yourself, the choice you would recommend, and say in a line what you chose.');
    expect(general).not.toContain('`ask`');
  });

  it('QA65-E14 without Decide for me the method still asks', () => {
    const lead = workingMethod('lead');
    expect(lead).toContain('A decision only the person can make, or a gap that changes the result, the design, or stored data');
    expect(lead).toContain('call `ask choice` with other set to true');
    expect(lead).toContain('To put a question to the person (a choice, a yes or no, a free answer), call `ask`.');
    expect(workingMethod('lead', 'general')).toContain('ask it in one round with `ask`');
  });

  it('QA67-H10 the map entry names no worker, and says a small change gets no map', () => {
    for (const name of ['designer', 'architect', 'tester', 'reviewer']) expect(executionMapDescription, name).not.toContain(name);
    expect(executionMapDescription).toContain('A bug fix, or a change to one or two files, never gets a map.');
  });
});
