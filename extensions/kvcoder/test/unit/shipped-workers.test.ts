import { describe, expect, it } from 'vitest';
import { shippedWorkers, type SubagentWorker } from '../../src/delegate/workers.ts';

function worker(name: string): SubagentWorker {
  const found = shippedWorkers.find((entry) => entry.name === name);
  if (found === undefined) throw new Error(`There is no shipped worker ${name}.`);
  return found;
}

const has = (name: string, phrases: readonly string[]): void => {
  for (const phrase of phrases) expect(worker(name).instructions).toContain(phrase);
};

describe("the shipped specialists' descriptions and instructions (ADR 0076)", () => {
  it("M2.4-E284 each specialist has its description, and instructions that add to the worker's method", () => {
    expect(shippedWorkers.map((entry) => [entry.name, entry.description])).toEqual([
      ['general', 'Any separate, self-contained task'],
      ['ui-ux', 'Designs the experience and the look of a screen or flow, to usability and accessibility standards'],
      ['architect', "Designs the structure of a change, on sound engineering practice and the project's own patterns and conventions"],
      ['tester', 'QA engineer: writes and runs test cases, automated and by hand as a person would, on the critical flows, security, and performance, and reports the issues'],
      ['reviewer', 'Reviews code and reports wrong style, needless complexity, and unclean or unclear code'],
    ]);
    expect(worker('general').instructions).toBe('');
    for (const entry of shippedWorkers.slice(1)) {
      expect(entry.instructions.startsWith('You are a senior ')).toBe(true);
      expect(Buffer.byteLength(entry.instructions, 'utf8')).toBeLessThan(16 * 1024);
      for (const heading of ['Result:', 'Evidence:', 'Files changed:', 'Unchecked:', 'Questions:']) expect(entry.instructions).not.toContain(heading);
    }
  });

  it('M2.4-E285 the designer works from the person, the project, every state, and named standards', () => {
    has('ui-ux', [
      'You own the experience and the look of what the task asks for',
      'Start from the person: who uses this, what they came to do, and the shortest clear way there.',
      "Read the project's existing screens, components, styles, tokens, and wording first, and design with them",
      'every state designed: empty, loading, partial, error, success, and disabled.',
      'Visuals: a clear hierarchy, where size, weight, spacing, and contrast show what matters first',
      'WCAG 2.2 AA (text contrast of 4.5 to 1, everything reachable by keyboard with a visible focus, a label or a name on every control, targets of at least 24 by 24 px)',
      "Return the design in your answer: the flow step by step, each screen's layout, states, and exact wording",
      "Don't change the project's files unless the task asks you to build the design",
    ]);
    expect(worker('ui-ux').readOnly).toBe(false);
  });

  it("M2.4-E286 the architect designs inside the project's patterns, on named practices, and returns the build order", () => {
    has('architect', [
      "Work out the project's patterns and conventions from them (its layers, naming, error handling, data access, and tests) and design inside them.",
      'Where your design departs from one, say so and why.',
      'one clear responsibility per part, high cohesion and low coupling, dependencies that point one way and never in a circle, an explicit contract at every boundary',
      "add no layer, abstraction, option, or dependency the task doesn't need",
      'For a decision that matters, weigh at least one real alternative and say why you chose as you did.',
      'the order to build them in and what can be built side by side',
      "Don't edit the project's files.",
    ]);
    expect(worker('architect').readOnly).toBe(true);
  });

  it('M2.4-E287 the tester is a QA engineer who tests by risk, automated and by hand, and reports', () => {
    has('tester', [
      "You are a senior QA engineer. You test what the task names the way the people who depend on it will use it, and you report what is wrong; you don't fix it.",
      'Choose the test cases by risk, before you test.',
      'First come the flows the business depends on: the main thing a person comes to do, and anything that touches money, data, or access. Then security, then performance.',
      "Automated: write the cases in the project's own test setup and style",
      "By hand: use it as a person would. Run the app or the command and go through each flow from start to end, with the `mcp` connector's browser when there is one",
      'Security: check that every input is validated, that a person reaches only what they are allowed to',
      'Performance: measure the critical paths with a realistic amount of data, and report the numbers and how you measured them.',
      'Report each issue with its severity (critical, high, medium, or low), the steps that reproduce it, what you expected, what happened, and the evidence.',
      "Don't change production code to make a test pass; report the defect.",
    ]);
    expect(worker('tester').readOnly).toBe(false);
  });

  it('M2.4-E288 the reviewer reports style, complexity, unclean and unclear code, and a defect first', () => {
    const lines = worker('reviewer').instructions.split('\n');
    expect(lines.slice(2, 6).map((line) => line.slice(0, line.indexOf(':')))).toEqual(['Style', 'Complexity', 'Unclean code', 'Unclear code']);
    has('reviewer', [
      "Judge against the project's own style and never against your taste.",
      'A correctness or security defect you meet on the way is reported too, and comes first.',
      'Report each finding with its severity (must fix, should fix, or consider), its file and line, what is wrong, why it matters, and what you expect instead',
      'Say so plainly when you find nothing.',
      "Don't edit the project's files.",
    ]);
    expect(worker('reviewer').readOnly).toBe(true);
  });
});
