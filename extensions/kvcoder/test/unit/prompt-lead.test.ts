import { describe, expect, it } from 'vitest';
import { buildPrompt } from '../../src/prompt/build-prompt.ts';

const lead = (platform: NodeJS.Platform = 'linux'): string => buildPrompt({ role: 'lead', workspacePath: '/w', language: 'en', platform, shell: platform === 'win32' ? 'powershell' : 'bash', sections: [], connectors: [] }).prompt;

const lineOf = (prompt: string, start: string): string => prompt.split('\n').find((line) => line.startsWith(start)) ?? '';

describe("the lead's prompt (08 §8.2, ADR 0022, 2 to 4)", () => {
  it('QA33-H1 the lead is an engineer with long experience who owns the outcome, on each OS, and no years are counted', () => {
    for (const [platform, system] of [['linux', 'Linux'], ['darwin', 'macOS'], ['win32', 'Windows']] as const) {
      const prompt = lead(platform);
      expect(prompt.startsWith(`You are kvman Coder, the lead engineer on this work: a software engineer with long, deep experience who owns the outcome. You understand the request, decide, plan, and execute it, in the folder /w on ${system}.\n`)).toBe(true);
      expect(prompt).not.toMatch(/\d+ years/);
    }
  });

  it('QA33-H2 the method says who decides, scales to the task, and has six steps in order', () => {
    const prompt = lead();
    expect(prompt).toContain('How you work. You are the one who decides: connectors and workers are how you act, and the result is yours. Scale the process to the task: a task of one file or a few steps needs no plan and no `plan` artifact, so skip steps 3 and 5 and just do it; a larger one follows these steps.');
    const steps = prompt.split('\n').filter((line) => /^\d\. /.test(line)).map((line) => line.split('.').slice(0, 2).join('.'));
    expect(steps).toEqual(['1. Understand', '2. Clarify', '3. Plan', '4. Execute', '5. Delegate', '6. Finish']);
  });

  it('QA33-H3 the plan uses only what the agent has and names what runs together, and the request is understood past its words', () => {
    const prompt = lead();
    expect(lineOf(prompt, '1. ')).toContain('Work out what the person needs, not only what they typed.');
    const plan = lineOf(prompt, '3. ');
    expect(plan).toContain('what each step uses (a connector from the list below, a worker), which steps can run at the same time, and how you will check each one.');
    expect(plan).toContain('Plan only with the connectors and workers you have.');
  });

  it('QA33-H4 independent work runs together: steps, calls, and workers, whose answers the lead checks', () => {
    const prompt = lead();
    expect(lineOf(prompt, '4. ')).toContain('Work through the steps, running the independent ones together.');
    const delegate = lineOf(prompt, '5. ');
    expect(delegate).toContain('Several `delegate run` calls in one reply run in parallel.');
    expect(delegate).toContain('Read what a worker returns and check it before you rely on it: its work is your responsibility.');
    expect(prompt).toContain('\nThe calls of one reply run at the same time, so put independent calls (reads, searches, separate files, separate workers) in one reply, and calls that depend on each other in separate replies.\n');
  });

  it('QA33-H5 the work is done when it is ready for production', () => {
    expect(lineOf(lead(), '6. ')).toBe("6. Finish. The work is done when it is ready for production: it does what was asked, it handles the errors and edge cases that will happen, it follows the project's conventions, its checks and tests pass, and nothing unfinished or temporary is left behind.");
  });

  it('QA33-H6 both roles decide from evidence', () => {
    const evidence = "\nDecide from evidence: every decision and every claim rests on something you read, ran, or were told. When you report a result, say what you checked and what you didn't.\n";
    expect(lead()).toContain(evidence);
    expect(buildPrompt({ role: 'worker', workspacePath: '/w', language: 'en', platform: 'linux', shell: 'bash', sections: [], connectors: [] }).prompt).toContain(evidence);
  });

  it("QA33-E2 the lead's prompt has nothing of a worker's, and no longer speaks of a task another agent gave", () => {
    const prompt = lead();
    for (const absent of ['that the lead agent gave you', '3. Return.', 'If another agent gave you your task']) expect(prompt, absent).not.toContain(absent);
  });
});
