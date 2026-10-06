import { describe, expect, it } from 'vitest';
import { buildPrompt } from '../../src/prompt/build-prompt.ts';

const promptOf = (role: 'lead' | 'worker'): string => buildPrompt({ role, workspacePath: '/w', language: 'en', platform: 'linux', shell: 'bash', sections: [], connectors: [] }).prompt;

const closingRule = 'A reply that only says what you will do ("now I will write the file") ends the turn with nothing done.';

describe("a worker's prompt (08 §8.2 and §8.5, ADR 0022, 3)", () => {
  it('QA33-H7 a worker does the one task the lead gave it, in three steps', () => {
    const prompt = promptOf('worker');
    expect(prompt.startsWith('You are kvman Coder, working on one task that the lead agent gave you, in the folder /w on Linux: a software engineer with long, deep experience.\nReply in English (en) unless the person writes in another language.\n')).toBe(true);
    expect(prompt).toContain("How you work. Do the task you were given and return the result; don't re-plan it or widen it, and ask the person only if you are blocked.");
    const steps = prompt.split('\n').filter((line) => /^\d\. /.test(line));
    expect(steps.map((line) => line.split('.').slice(0, 2).join('.'))).toEqual(['1. Understand', '2. Do it', '3. Return']);
    expect(steps[0]).toContain("when you can't find a fact, say so in your answer.");
    expect(steps[1]).toContain("Make the smallest change that does the task, check it with the project's own check or tests, and fix a failure at its cause.");
    expect(steps[2]).toBe('3. Return. Your last reply is the result the lead agent reads: what you did or found, the evidence for it, and what is unchecked or left.');
  });

  it('QA33-H8 both roles keep the tool, the connectors with risky, and the closing rule', () => {
    for (const role of ['lead', 'worker'] as const) {
      const prompt = promptOf(role);
      expect(prompt, role).toContain('Your one tool is run: it runs one command of a connector, as { description, connector, command, payload }.');
      expect(prompt, role).toContain('Connectors are the only way you act.');
      expect(prompt, role).toContain('`shell exec`, `fs write`, `fs edit`, and `mcp call` take risky, which you always send');
      expect(prompt.endsWith(closingRule), role).toBe(true);
      expect(prompt, role).toContain('Before you say that something runs or works, check it the way the person would');
    }
  });

  it('QA33-E1 a worker has no plan step, no delegate step, and none of the lead\'s lines', () => {
    const prompt = promptOf('worker');
    for (const absent of ['Write the plan as the artifact `plan`', '`ask confirm`', '`delegate`', '6. Finish.', 'Keep replies short', 'the lead engineer on this work', 'Scale the process to the task']) expect(prompt, absent).not.toContain(absent);
  });
});
