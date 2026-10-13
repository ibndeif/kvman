import { describe, expect, it } from 'vitest';
import { artifactDescription } from '../../src/connectors/artifact.ts';
import { payloadJsonSchema } from '../../src/connectors/connector-command.ts';
import { executionMapCommands, executionMapDescription } from '../../src/connectors/execution-map.ts';
import { workingMethod } from '../../src/prompt/working-method.ts';

const steps = (text: string): string[] => text.split('\n').filter((line) => /^\d\. /.test(line)).map((line) => line.slice(0, line.indexOf('. ', 3)));

describe("the lead's working method (08 §8.2, ADR 0065)", () => {
  it('M2.4-E227 and E262 the lead sizes up each task and chooses its path from the named parts', () => {
    const lead = workingMethod('lead');
    expect(steps(lead)).toEqual([]);
    expect(steps(workingMethod('worker'))).toEqual(['1. Understand', '2. Do it', '3. Return']);
    expect(lead.split('\n').slice(3, 12).map((line) => line.slice(0, line.indexOf('. ')))).toEqual(['Understand', 'Clarify', 'Plan', 'Confirm the plan', 'Execute', 'Stay on the task', 'Delegate', 'Show what the person will look at', 'Finish']);
    for (const phrase of [
      'No path is fixed: you choose it for each task from what the task is, and you change it when what you find changes it.',
      'Size up the task first. Read the request and look at what it touches, then judge four things: how clear it is (can you say what done looks like?), how much it changes (one place, or several parts that depend on each other), what could go wrong and how hard that is to take back, and whether the person will look at the result (a screen, a page, a report).',
      'choose the lightest path that delivers the task well. A question needs an answer from what you read, and no change. A small, clear change needs doing and checking, and nothing more. An unclear request needs its questions answered before any work. Work in several parts, or work that is hard to take back, needs an execution map the person agreed to.',
      'A task that turns out larger than it looked gets its map then, and one that turns out simple drops what it does not need.',
      'These are the parts of a path. Use only the ones your path has.',
      'With no map, make the smallest change that does the task, check it, and fix a failure at its cause.',
      'mark it done with your evidence, which is what you ran and what it showed, before you start the next task: don\'t save the marks for the end. A task is not done because you wrote it.',
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
    for (const gone of ['`plan`', '☐', 'artifact edit', 'checklist', 'Scale the process to the task', 'about five calls', 'skip steps']) expect(lead, gone).not.toContain(gone);
    // M2.4-E247: a project's commands are kept in its AGENTS.md (ADR 0069, 4).
    const commands = "When you found how this project is built, tested, or run and its AGENTS.md does not say it, add a short Commands section to AGENTS.md with risky set to true: that asks the person, so don't ask them a second time with `ask`.";
    expect(lead).toContain(commands);
    expect(workingMethod('worker')).not.toContain('Commands section');
  });

  it('M2.4-E256 and E263 the map is the detailed plan, made after looking, and the person agrees to it before any step starts', () => {
    const lead = workingMethod('lead');
    for (const phrase of [
      'Plan. Only after you understood the request, looked at what exists, and have your answers, and before you change anything, plan with `execution-map set`: never in your first reply, because a map made before you looked is a guess.',
      'The map is the implementation plan the person reads, so make it detailed, not an outline.',
      'A task is one concrete change you can name before you start it: the file or the few files that change together, a test, or a command to run, never a phase such as implement or a whole feature.',
      'Its description says what the task changes and how, naming the files or parts and the approach, in words the person understands without reading the code; its check is the exact command you will run or the thing you will look at.',
      "end the map with the project's own checks (its build, lint, and tests)",
      'Confirm the plan. The person agrees to the map before you work on it. Once an `execution-map set` that made the map or changed its tasks succeeded, and before you start any task, call `ask choice` with other set to true: ask whether to start, with the option that starts first and an option that changes the plan, so the person can write what to change.',
      'When they ask for changes, set the map again with them and ask again; start only after they chose to start. A change of status with `execution-map update` needs no confirmation.',
    ]) expect(lead, phrase).toContain(phrase);
    for (const gone of ['`ask confirm`', 'Set it in the same reply as your first call', 'For a large, ambiguous, or risky task']) expect(lead, gone).not.toContain(gone);
    expect(executionMapDescription).toContain('the detailed implementation plan the person reads, agrees to, and watches as a diagram');
    expect(executionMapDescription).toContain('A task says what it changes and how in its description, which the person opens with a press');
  });

  it('M2.4-E276 branches come from real dependencies, and the map is followed and kept live', () => {
    const lead = workingMethod('lead');
    for (const phrase of [
      "Shape the map from what truly depends on what. A task comes after another only when it needs that task's result: its file, its output, or its decision. The order you thought of them in is not a reason.",
      'Tasks that touch separate files or parts and need nothing from each other are branches: give them the same `after`, or none, so the map shows them side by side and they can run together.',
      'Where branches meet, add the task that joins them, such as wiring the parts together or the check that needs all of them, after every branch it needs.',
      'A chain is right only when each task needs the one before it.',
      'after everything they cover.',
      'With a map, the map is how you work, and the person follows the work on it, so it must always say where you are.',
      'Every map call returns the tasks that are ready: take those, and never work on a task the map does not have.',
      'Mark a task doing before your first call on it, in the same reply as that call, and when several are ready, mark each one you start.',
      'Do small ready tasks together in one reply, and hand a large separate branch to a worker that runs beside you, as Delegate says.',
      'As soon as its check passed, mark it done with your evidence',
      "Mark a task you can't finish failed with a note that says why, and one that turned out unneeded skipped with a note.",
      'When the plan itself changes (a task is missing, one is no longer needed, or the order was wrong), set the map again before you go on: a task whose id stays keeps how far it got.',
    ]) expect(lead, phrase).toContain(phrase);
  });

  it('M2.4-E277 the map connector speaks of tasks, and only the field is named steps', () => {
    const said = [executionMapDescription, ...Object.values(executionMapCommands).map((command) => command.description), JSON.stringify(payloadJsonSchema(executionMapCommands.set.payload)), JSON.stringify(payloadJsonSchema(executionMapCommands.update.payload))].join('\n');
    expect(said).toContain('where each node is one task');
    expect(said).toContain('comes after another only when it needs its result, so separate tasks are branches that run together');
    expect(said).toContain('The ids of the tasks whose result this one needs');
    expect(said.replaceAll('"steps"', '').match(/\bsteps?\b/gi)).toBeNull();
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
