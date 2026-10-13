import { describe, expect, it } from 'vitest';
import { artifactDescription } from '../../src/connectors/artifact.ts';
import { workingMethod } from '../../src/prompt/working-method.ts';

const steps = (text: string): string[] => text.split('\n').filter((line) => /^\d\. /.test(line)).map((line) => line.slice(0, line.indexOf('. ', 3)));

describe("the lead's working method (08 §8.2, ADR 0065)", () => {
  it('M2.4-E227 the lead plans on the execution map, stays on its task, and shows UI in an artifact', () => {
    const lead = workingMethod('lead');
    expect(steps(lead)).toEqual(['1. Understand', '2. Clarify', '3. Plan', '4. Execute', '5. Stay on the task', '6. Delegate', '7. Show what the person will look at', '8. Finish']);
    for (const phrase of [
      'a task that changes one file, or that about five calls finish, needs no execution map and no worker, so skip steps 3 and 6',
      '3. Plan. Only after you understood the request, looked at what exists, and have your answers, and before you change anything, plan with `execution-map set`: never in your first reply, because a map made before you looked is a guess.',
      'A step is one thing you deliver and can check, such as a file, a feature, or a test run, not a phase such as implement.',
      "end it with the project's own checks (its build, lint, and tests)",
      'call `ask confirm` after you set the map and before you start',
      'mark it done with your evidence: what you ran and what it showed. A step is not done because you wrote it.',
      'do not look into it: record it with `execution-map note`, or keep it for your final answer when there is no map, and go on.',
      'only when it is separate work that runs beside yours, or a fresh review of a change you finished',
      'show it in an artifact: the design as an HTML page before you build it when the layout is a real choice, and the running app as a url artifact once it runs',
      'right to left for Arabic',
      'Stop what you started in the background and no longer need, and delete the temporary files you or your tools left in the workspace folder, such as logs, snapshots, and scratch files.',
      'text that stands out clearly from its background, and calm colours; every field and every element that shows text the person typed has dir="auto", so Arabic they type reads right to left on any page.',
      "when the mcp connector gives you a browser, try the page's main actions with one `mcp run`.",
      'what was done, what you checked and what it showed, what is unchecked, what still runs in the background, and what you noted for later.',
      'decide an ordinary detail that is easy to change yourself: say what you chose.',
    ]) expect(lead, phrase).toContain(phrase);
    for (const gone of ['`plan`', '☐', 'artifact edit', 'checklist']) expect(lead, gone).not.toContain(gone);
    // M2.4-E256: the map comes after understanding (ADR 0070, 3).
    expect(lead).not.toContain('Set it in the same reply as your first call');
    expect(lead).toContain('is planned on its map once you understand it.');
    // M2.4-E247: a project's commands are kept in its AGENTS.md (ADR 0069, 4).
    const commands = "When you found how this project is built, tested, or run and its AGENTS.md does not say it, add a short Commands section to AGENTS.md with risky set to true: that asks the person, so don't ask them a second time with `ask`.";
    expect(lead).toContain(commands);
    expect(workingMethod('worker')).not.toContain('Commands section');
  });

  it('M2.4-E228 both roles spend context with care and add nothing unasked, and the artifact connector names no plan', () => {
    for (const role of ['lead', 'worker'] as const) {
      const method = workingMethod(role);
      expect(method, role).toContain("Spend context with care: every result stays in the conversation and is read again at every step. Search before you read, read only the part of a long file you need, and don't read again a file you already hold");
      expect(method, role).toContain("call `background wait` once; don't ask for its output again and again");
      expect(method, role).toContain("don't add what wasn't asked: no extra feature, file, option, or document.");
    }
    expect(artifactDescription).not.toMatch(/plan/i);
    // ADR 0067, 7: a diagram is Mermaid code that kvman draws, never SVG the agent writes.
    expect(artifactDescription).toContain("For a diagram, write Mermaid code in a fenced mermaid block of a Markdown artifact or reply: kvman draws it. Don't write SVG for a diagram.");
    expect(artifactDescription.startsWith('Show the person something to read or see: a report, a design, an HTML page, or the localhost address')).toBe(true);
  });
});
