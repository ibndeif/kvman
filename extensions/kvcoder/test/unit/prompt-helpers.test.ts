import { describe, expect, it } from 'vitest';
import { shippedWorkers } from '../../src/delegate/workers.ts';
import { workingMethod } from '../../src/prompt/working-method.ts';

// Helpers that finish, answers that cover the request (plan 08 §8.2 and §8.5, ADR 0113).

const lineOf = (method: string, start: string): string => method.split('\n').find((line) => line.startsWith(start)) ?? '';
const methods = ['engineering', 'general'] as const;
const copy = "Copy text, data, or code you didn't write (a document's text, a file, output) with a program, never by typing it again: retyping changes it.";
const scratch = 'Put scratch output (images, extracted text, logs) in a temporary folder outside the workspace folder, and remove it when done.';
const readable = 'Write code laid out for the people who will read it: one statement per line, indented, and no packed or minified lines in source you write.';

describe('helpers that finish, answers that cover the request (08 §8.2, ADR 0113)', () => {
  it('QA74-H1 a helper finishes its run, in both worker methods', () => {
    for (const method of methods) {
      expect(workingMethod('worker', method).split('\n')).toContain('Your run ends only when its done condition is met, your steps run out, or you are blocked: never to report progress or after one part. A large task is no blocker: do it in parts, one after another, in this run.');
    }
  });

  it('QA74-H2 the lead stays quiet on an ending that needs nothing, and continues a helper with all that is left', () => {
    const delegate = lineOf(workingMethod('lead'), 'Delegate. ');
    expect(delegate).toContain('Continue a worker that stopped early with all that is left. When a worker\'s answer needs nothing from you and changes nothing for the person, reply with nothing.');
  });

  it('QA74-H4 the final answer answers each thing asked, and is one line or nothing while helpers still work', () => {
    for (const method of methods) {
      const lead = workingMethod('lead', method);
      expect(lead, method).toContain('and answers each thing the person asked for in this request, a short line each, what is still open included.');
      expect(lead, method).toContain('While helpers still work on the request, end with one line or nothing; when the last of them ends, give that whole answer.');
    }
  });

  it("QA74-H5 and QA74-H11 copy, don't retype, and scratch output leaves the workspace, for the lead and workers", () => {
    for (const role of ['lead', 'worker'] as const) {
      for (const method of methods) {
        const lines = workingMethod(role, method).split('\n');
        expect(lines, `${role} ${method}`).toContain(copy);
        expect(lines, `${role} ${method}`).toContain(scratch);
      }
    }
  });

  it('QA74-H6 a report says how much it covered', () => {
    expect(workingMethod('worker')).toContain('for a check, a review, or a comparison, how much you covered (for example "pages 36–66, 31 of 31") and what you didn\'t, since a claim without that goes under Unchecked.');
  });

  it("QA74-H7 the brief carries the person's instructions and a designer gets the app's address", () => {
    expect(lineOf(workingMethod('lead'), 'Delegate. ')).toContain("A worker sees only its brief and the rule files, so the brief carries, in the person's words, what they asked that applies to the run, and a designer's brief gives the running app's address.");
  });

  it('QA74-H9 large work is split, and Decide for me asks nothing in a reply either', () => {
    expect(lineOf(workingMethod('lead'), 'Choose the path from the task. ')).toContain("Work too large for one pass is no reason to stop or to say you can't: split it into parts, for workers at once or one after another.");
    expect(lineOf(workingMethod('lead', 'engineering', true), 'Clarify. ')).toContain('Put no question to the person in a reply either: decide, say what you chose, and go on.');
    expect(lineOf(workingMethod('lead'), 'Clarify. ')).not.toContain('Put no question to the person');
  });

  it('QA74-H10 the designer looks at the running app, and code is laid out for people', () => {
    expect(shippedWorkers.find((worker) => worker.name === 'ui-ux')?.instructions).toContain("When the app runs, open it with the `mcp` connector's browser and look at it before you design, and design from what is there.");
    expect(workingMethod('lead').split('\n')).toContain(readable);
    expect(workingMethod('worker').split('\n')).toContain(readable);
    expect(workingMethod('worker', 'general')).not.toContain(readable);
  });

  it('QA74-H11 console errors are read and an artifact is shown again under its id', () => {
    const lead = workingMethod('lead');
    expect(lead).toContain('Fix, or explain, every error a page or program reports while you check it, console errors too.');
    expect(lead).toContain('Show a thing again under its artifact id, never as a second artifact.');
  });

  it('QA74-E6 a worker gets no lead rules', () => {
    for (const method of methods) {
      const worker = workingMethod('worker', method);
      expect(worker, method).not.toContain('reply with nothing');
      expect(worker, method).not.toContain('Your final answer starts with the result');
    }
  });
});
