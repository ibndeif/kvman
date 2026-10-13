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

  it('QA33-H2 the method says who decides, fixes no path, and names the parts of a path in order', () => {
    const prompt = lead();
    expect(prompt).toContain('How you work. You are the one who decides: connectors and workers are how you act, and the result is yours. No path is fixed: you choose it for each task from what the task is, and you change it when what you find changes it.\n');
    expect(prompt.split('\n').filter((line) => /^\d\. /.test(line))).toEqual([]);
    const parts = ['Understand', 'Clarify', 'Plan', 'Confirm the plan', 'Execute', 'Stay on the task', 'Delegate', 'Show what the person will look at', 'Finish'];
    const places = parts.map((part) => prompt.indexOf(`\n${part}. `));
    expect(places.every((place) => place > 0)).toBe(true);
    expect(places).toEqual([...places].sort((first, second) => first - second));
  });

  it('QA33-H3 the plan uses only what the agent has and names what runs together, and the request is understood past its words', () => {
    const prompt = lead();
    expect(lineOf(prompt, 'Understand. ')).toContain('Work out what the person needs, not only what they typed.');
    const plan = lineOf(prompt, 'Plan. ');
    expect(plan).toContain('each with a title, a description, what it comes after, what it uses, and how you will check it.');
    expect(plan).toContain('yourself, with a connector from the list below, for an ordinary change; or a worker of the `delegate` connector whose description fits');
    expect(plan).toContain('A branch means delegation: steps side by side on the map run at the same time, each done by a worker.');
  });

  it('QA33-H4 independent work runs together: steps, calls, and workers, whose answers the lead checks', () => {
    const prompt = lead();
    expect(lineOf(prompt, 'Execute. ')).toContain('When several steps are ready together they are branches: mark each doing and start them all in one reply, one `delegate run` each, so they run at the same time.');
    const delegate = lineOf(prompt, 'Delegate. ');
    expect(delegate).toContain('Several `delegate run` calls in one reply run in parallel.');
    expect(delegate).toContain('Read what a worker returns and check it before you rely on it: its work is your responsibility.');
    expect(prompt).toContain('\nIn one reply, reads and searches run at the same time, and calls that change something (shell lines, writes, edits) run one after another in the order you give them. So put independent calls (reads, searches, separate files, separate workers) in one reply, and a call that needs another call\'s result in a later reply: several new files are several `fs write` calls in one reply, not one reply each.\n');
  });

  it('QA33-H5 the work is done when it is ready for production', () => {
    expect(lineOf(lead(), 'Finish. ')).toContain("Finish. The work is done when it is ready for production: it does what was asked, it handles the errors and edge cases that will happen, it follows the project's conventions, its checks and tests pass, and nothing unfinished or temporary is left behind.");
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
