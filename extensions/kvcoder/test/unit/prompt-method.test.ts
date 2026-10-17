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
      'mark it done with your evidence, which is what you ran and what it showed, before you start the next step: don\'t save the marks for the end. A step is not done because you wrote it.',
      'do not look into it: record it with `execution-map note`, or keep it for your final answer when there is no map, and go on.',
      'separate work that runs beside yours, or a fresh review of a change you finished',
      'show it in an artifact: the design as an HTML page before you build it when the layout is a real choice, and the running app as a url artifact once it runs',
      'right to left for Arabic',
      'Stop what you started in the background and no longer need, and delete the temporary files you or your tools left in the workspace folder, such as logs, snapshots, and scratch files.',
      'text that stands out clearly from its background, and calm colours; every field and every element that shows text the person typed has dir="auto", so Arabic they type reads right to left on any page.',
      "when the mcp connector gives you a browser, try the page's main actions with one `mcp run`.",
      'Your final answer, in plain words and as short as the facts allow, says what was done, what you checked and what it showed, what is unchecked, what still runs in the background, and what you noted for later.',
      'An ordinary detail that is easy to change: decide it yourself, and say what you chose.',
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
      'It is the implementation plan the person reads and agrees to, so make it detailed, not an outline.',
      "end the map with the project's own checks (its build, lint, and tests)",
      'Confirm the plan. The person agrees to the map before you work on it. Once the first map of the request, or a map you set again with a change to what the person gets (the goal, what done looks like, what stays as it is, stored data, or what could go wrong), has details on every step (its undetailed list is empty), and before you start any step, call `ask choice` with other set to true.',
      'then it asks whether to start, with the option that starts first and an option that changes the plan, so the person can write what to change.',
      'When they ask for changes, set the map again with them, detail what changed, and ask again; start only after they chose to start.',
      'A change of status with `execution-map update` needs no confirmation.',
    ]) expect(lead, phrase).toContain(phrase);
    for (const gone of ['`ask confirm`', 'Set it in the same reply as your first call', 'For a large, ambiguous, or risky task']) expect(lead, gone).not.toContain(gone);
    expect(executionMapDescription).toContain('the implementation plan the person reads, agrees to, and watches as a diagram');
  });

  it('M2.4-E276 and E282 a branch means delegation, the steps of the lead are one line, and the map is followed and kept live', () => {
    const lead = workingMethod('lead');
    for (const phrase of [
      'Shape the map from how the work will really run. Your own steps are one line: each comes after the one before it, in the order you will do them.',
      'A branch means delegation: steps side by side on the map run at the same time, each done by a worker.',
      'So draw a branch only for a piece of work you hand to a worker: it needs nothing from the other branches, it touches files or parts no other branch touches, it is large enough to be worth a worker that starts with none of this conversation, and its step names that worker in uses.',
      "Give the branches that start together the same `after`, or none, and don't split small independent changes into branches: do them in your own line.",
      'Where branches meet, add the step that joins them, such as wiring the parts together or the check that needs all of them, after every branch it needs.',
      'after everything they cover.',
      'With a map, the map is how you work, and the person follows the work on it, so it must always say where you are.',
      'Every map call returns the steps that are ready: take those, and never work on a step the map does not have.',
      'Mark a step doing before your first call on it, in the same reply as that call, and when several are ready, mark each one you start.',
      'When several steps are ready together they are branches: mark each doing and start them all in one reply, one `delegate run` each, so they run at the same time.',
      'As soon as its check passed, mark it done with your evidence',
      "Mark a step you can't finish failed with a note that says why, and one that turned out unneeded skipped with a note.",
      'When the plan itself changes (a step is missing, one is no longer needed, or the order was wrong), set the map again before you go on: a step whose id stays keeps how far it got and its details.',
    ]) expect(lead, phrase).toContain(phrase);
  });

  it('M2.4-E277 and E278 the map connector speaks of steps, never of tasks as its nodes', () => {
    const said = [executionMapDescription, ...Object.values(executionMapCommands).map((command) => command.description), JSON.stringify(payloadJsonSchema(executionMapCommands.set.payload)), JSON.stringify(payloadJsonSchema(executionMapCommands.update.payload))].join('\n');
    expect(said).toContain('Steps side by side are branches: each is handed to a worker, so they run at the same time, and your own steps are one line.');
    // "The task" is the person's request there; a node is never called one.
    expect(said.match(/\btasks\b|\b(?:a|each|one|ready) task\b/gi)).toBeNull();
    const lead = workingMethod('lead');
    for (const part of ['Plan. ', 'Confirm the plan. ', 'Execute. ']) expect(lead.split('\n').find((line) => line.startsWith(part))?.replaceAll('does the task', '').match(/\btasks?\b/gi), part).toBeNull();
  });

  it('M2.4-E279 the map is the execution path, and a step is one stage of it', () => {
    const lead = workingMethod('lead');
    for (const phrase of [
      'The map is your execution path: the steps that, from what you found, are the best, most practical, and fastest way to deliver what the person asked with the connectors and workers you have.',
      'It is the implementation plan the person reads and agrees to, so make it detailed, not an outline.',
      'A step is one stage of the path: what gets done, who does it, and how it is checked. It may cover the few files that change together, but it is always concrete, something you can name before you start it, never a phase such as implement or a whole feature.',
    ]) expect(lead, phrase).toContain(phrase);
    expect(lead).not.toContain('a test, or a command to run');
  });

  it('M2.4-E280 who does a step is chosen by fit and named in uses, and Delegate allows a specialist', () => {
    const lead = workingMethod('lead');
    for (const phrase of [
      'Choose for each step whoever does it best and fastest, and name it in uses: yourself, with a connector from the list below, for an ordinary or small change; or a worker of the `delegate` connector whose description fits, when the step needs that skill:',
      'a designer for a screen or flow whose design is a real choice, an architect for a structure decision that spans several parts, a tester for tests that are a piece of work of their own, a reviewer for a finished change that is risky or wide.',
      'Delegate. A step goes to a worker of the `delegate` connector when the worker does it better or faster than you would: a specialist whose skill the step needs, separate work that runs beside yours, or a fresh review of a change you finished; its entry lists the workers and what each is for.',
      "Don't delegate what a few calls of your own would do, and ask for one review of a piece of work, not several.",
    ]) expect(lead, phrase).toContain(phrase);
    expect(lead).not.toContain('only when it is separate work');
  });

  it('M2.4-E281 a step that names a worker goes to it, and the map entry says who does a step', () => {
    expect(workingMethod('lead')).toContain('Hand any step whose uses names a worker to that worker with `delegate run`, and check its answer before you mark the step done.');
    expect(executionMapDescription).toContain('your execution path, the steps you found to be the best and fastest way to deliver the request with the connectors and workers you have');
    expect(executionMapDescription).toContain('names who does it in uses');
    expect(JSON.stringify(payloadJsonSchema(executionMapCommands.set.payload))).toContain('Who does the step: a connector such as fs, or a worker such as delegate architect; several as a list.');
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

  it('M2.4-E301 and E302 the lead talks to the person clearly and briefly, and a worker does not get that rule', () => {
    const rule = 'Talk to the person clearly and briefly. Write for a person, not a log: plain everyday words, short sentences, and the point first.';
    const lead = workingMethod('lead');
    for (const phrase of [
      rule,
      'Leave out your inner steps, connector and command names, payloads, ids, and long output unless they ask; name a file or a technical term only when it helps them, and explain the term in a few words.',
      'Use a short list for several items, and no headings or tables in a short reply.',
    ]) expect(lead, phrase).toContain(phrase);
    expect(workingMethod('worker')).not.toContain(rule);
  });

  it('M2.4-E307 the lead understands the goal behind the request, what exists, and what was left unsaid', () => {
    const understand = workingMethod('lead').split('\n').find((line) => line.startsWith('Understand. ')) ?? '';
    for (const phrase of [
      'Read everything they sent, attached images and files too,',
      'and what already does part of it, so you build on it and not beside it.',
      'what done looks like to them, as examples they would check',
      'what the work changes or must keep working (other callers, stored data, settings, users)',
      'whether they asked for a goal or for a particular means (a format, a library, a design), and whether that means serves the goal',
      "what they didn't say that changes the result (who uses it, how much data or load, which platforms and languages, privacy and security, and how good is good enough)",
      'which of your connectors and workers help, and what is missing.',
      'through a connector that reaches it rather than from memory',
    ]) expect(understand, phrase).toContain(phrase);
    expect(workingMethod('lead')).not.toContain('`docs get`');
  });

  it('M2.4-E308 the lead sorts what is open into look, decide, and ask, says when a means works against the goal, and asks in one round', () => {
    const clarify = workingMethod('lead').split('\n').find((line) => line.startsWith('Clarify. ')) ?? '';
    for (const phrase of [
      "A fact that looking would answer: look, don't ask.",
      'A decision only the person can make, or a gap that changes the result, the design, or stored data,',
      'or would break what exists: ask before any work.',
      'When the means they asked for works against their goal, or a clearly better way exists, say so and offer both before you build theirs.',
      'Ask in one round when you can, after you looked and before you plan',
      'your recommended one first and each option saying what it leads to.',
    ]) expect(clarify, phrase).toContain(phrase);
  });

  it('M2.4-E309 the plan question says back what the lead understood, and the map goal is the outcome in the person\'s terms', () => {
    const lead = workingMethod('lead');
    expect(lead).toContain('Its question first says in a few lines what you understood: the goal, what done looks like, what stays as it is, and the choices you made for the person; then it asks whether to start');
    expect(lead).toContain('Give the goal, the outcome the person wants in their own terms, then the steps');
  });

  it('M2.4-E310 the lead leaves running what the person will try, and still stops what is no longer needed', () => {
    const finish = workingMethod('lead').split('\n').find((line) => line.startsWith('Finish. ')) ?? '';
    expect(finish).toContain('Stop what you started in the background and no longer need');
    expect(finish).toContain('Leave running what the person will try themselves, such as the app or page you built, with its address in a url artifact when it has one.');
    expect(workingMethod('worker')).not.toContain('Leave running');
  });

  it('M2.4-E311 the repeated sentences are gone from the lead, and the worker keeps its own method', () => {
    const lead = workingMethod('lead');
    for (const gone of ['give it a step only when its skill', 'so delegate only what is worth that', 'Write each file in its own call']) expect(lead, gone).not.toContain(gone);
    const worker = workingMethod('worker');
    expect(worker).toContain('Write each file in its own call, with `fs write`.');
    expect(worker).not.toContain('Read everything they sent');
  });

  it('QA54-H10 the lead sets the skeleton first, details each step in Markdown, and asks once every step has details', () => {
    const lead = workingMethod('lead');
    for (const phrase of [
      'then the steps, each with a title, what it comes after, what it uses, and how you will check it.',
      "A step's details say what it changes and how, naming the files or parts and the approach, in words the person understands without reading the code: write them in Markdown, with a list, a table, or a Mermaid diagram or chart in a fenced mermaid block where it shows the step better than words, and never SVG.",
      "Set the map's skeleton first, with no details, then write each step's details with `execution-map detail`, one call per step, all in the reply after the set.",
      'When you set the map again, a step whose id stays keeps its details: detail again only a step whose approach changed, and each new step.',
      'has details on every step (its undetailed list is empty), and before you start any step',
    ]) expect(lead, phrase).toContain(phrase);
    expect(lead).not.toContain("A step's description");
    expect(executionMapDescription).toContain("Set the skeleton first: each step names who does it in uses and comes after the steps it follows. Then write each step's details with detail, one call per step: what it changes and how, in Markdown, with lists, tables, and Mermaid diagrams or charts in fenced mermaid blocks, never SVG. The person opens them with a press, and a step can't be doing until it has them.");
    expect(executionMapDescription).toMatch(/Limits: goal up to 300 characters; a step's title up to 100, check up to 300, details up to 4,000; [^.]*; 1 to 40 steps\.$/);
  });
});
