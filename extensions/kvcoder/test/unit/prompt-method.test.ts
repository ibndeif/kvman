import { describe, expect, it } from 'vitest';
import { artifactDescription } from '../../src/connectors/artifact.ts';
import { payloadJsonSchema } from '../../src/connectors/connector-command.ts';
import { executionMapCommands, executionMapDescription } from '../../src/connectors/execution-map.ts';
import { workingMethod } from '../../src/prompt/working-method.ts';

const steps = (text: string): string[] => text.split('\n').filter((line) => /^\d\. /.test(line)).map((line) => line.slice(0, line.indexOf('. ', 3)));

describe("the lead's working method (08 §8.2, ADR 0065)", () => {
  // Path and parts superseded in part by QA73-H5 (ADR 0112, 3).
  it('M2.4-E227, E262, and QA73-H5 the lead chooses its path for each task from the named parts', () => {
    const lead = workingMethod('lead');
    expect(steps(lead)).toEqual([]);
    expect(steps(workingMethod('worker'))).toEqual(['1. Understand', '2. Do it', '3. Return']);
    // Superseded by QA68-H6: Deliberate comes before Plan (ADR 0103, 6); and by QA72-H1: no Tests part (ADR 0111).
    expect(lead.split('\n').slice(4, 13).map((line) => line.slice(0, line.indexOf('. ')))).toEqual(['Understand', 'Clarify', 'Deliberate', 'Map', 'Execute', 'Stay on the task', 'Delegate', 'Show what the person will look at', 'Finish']);
    for (const phrase of [
      'No path is fixed: you choose it for each task from what the task is, and you change it when what you find changes it.',
      'Choose the path from the task. A question gets an answer from what you read, and no change. A small, clear change is done and checked, and nothing more. An unclear request gets its questions answered before any work. Work that changes several parts that depend on each other, or that is hard to take back, gets a map the person agreed to; other work, even of a few steps, gets none: do it, and say where you are as you go.',
      'A task that turns out larger than it looked gets its map then. Use only the parts below that your path needs.',
      // ADR 0097, 5: the map's own rules are in its entry; Execute keeps how each step is done.
      'For each step, or with no map for all of what was asked, make the smallest change that does it, check it, and fix a failure at its cause.', 'A step is not done because you wrote it.',
      'do not look into it: record it with `execution-map note`, or keep it for your final answer when there is no map, and go on.',
      // ADR 0108, 4: a run is one deliverable, delegated when it pays.
      "Delegate find, check, and review runs, and change runs only when two or more run at once on files that don't overlap",
      'show it in an artifact: the design as an HTML page before you build it when the layout is a real choice, and the running app as a url artifact once it runs',
      'right to left for Arabic',
      'Stop what you started in the background and no longer need, and delete the temporary files you or your tools left in the workspace folder, such as logs, snapshots, and scratch files.',
      'text that stands out clearly from its background, and calm colours; every field and every element that shows text the person typed has dir="auto", so Arabic they type reads right to left on any page.',
      "when the mcp connector gives you a browser, try the page's main actions with one `mcp run`.",
      'Your final answer starts with the result, in plain words and as short as the facts allow.',
      'An ordinary detail that is easy to change: decide it yourself, and say what you chose.',
    ]) expect(lead, phrase).toContain(phrase);
    for (const gone of ['`plan`', '☐', 'artifact edit', 'checklist', 'Scale the process to the task', 'about five calls', 'skip steps']) expect(lead, gone).not.toContain(gone);
    // M2.4-E247: a project's commands are kept in its AGENTS.md (ADR 0069, 4).
    const commands = "When you found how this project is built, tested, or run and its AGENTS.md does not say it, add a short Commands section to AGENTS.md with risky set to true: that asks the person, so don't ask them a second time with `ask`.";
    expect(lead).toContain(commands);
    expect(workingMethod('worker')).not.toContain('Commands section');
  });

  // Plan and Confirm the plan superseded by Map, QA73-H6 and E5 (ADR 0112, 3).
  it('M2.4-E256, E263, QA73-H6, and QA73-E5 the map is the detailed plan, made after looking, and the person agrees to it before any step starts', () => {
    const lead = workingMethod('lead');
    for (const phrase of [
      'Map. Only when your path needs one, after you understood the request, looked at what exists, and have your answers, and before you change anything: never in your first reply, because a map made before you looked is a guess.',
      'The map is the implementation plan the person reads and agrees to, so make it detailed, not an outline;',
      "Once every step has details (its undetailed list is empty), and before you start any step, get the person's agreement.",
      'When they already told you to go ahead with what the map does, say in a few lines what you understood (the goal, what done looks like, what stays as it is, and the choices you made for the person) and start.',
      'Otherwise call `ask choice` with other set to true: its question says those few lines, then asks whether to start, the option that starts first and one that changes the plan; when they ask for changes, set the map again, detail what changed, and ask again.',
      'A map set again with a change to what the person gets (the goal, what done looks like, what stays as it is, stored data, or what could go wrong) needs their agreement again;',
      "a change inside the plan (who does a step, the order, a step split or retried, or a worker reassigned) or of a step's status needs none: say what changed in one line.",
    ]) expect(lead, phrase).toContain(phrase);
    for (const gone of ['`ask confirm`', 'Set it in the same reply as your first call', 'For a large, ambiguous, or risky task', 'Confirm the plan']) expect(lead, gone).not.toContain(gone);
    expect(executionMapDescription).toContain('the implementation plan the person reads, agrees to, and watches as a diagram');
    expect(executionMapDescription).toContain("and end with the project's own checks after everything they cover.");
  });

  it('M2.4-E276 and E282 a branch means delegation, the steps of the lead are one line, and the map is followed and kept live', () => {
    expect(workingMethod('lead')).toContain('Execute. With a map, work through it as its entry says, so it always shows where you are');
    for (const phrase of [
      'Your own steps are one line, each after the one before.',
      'Steps side by side are branches, and a branch means delegation: draw one only for work a worker does that needs nothing from the other branches, touches files no other branch touches, and is worth a worker that starts with none of this conversation;',
      'give the branches that start together the same after, or none, and add the step that joins them after every branch it needs.',
      "Don't split small independent changes into branches, leave out any step that nothing needs",
      'Every map call returns the steps that are ready: take those, and never work on a step the map does not have.',
      'Mark a step doing in the same reply as your first call on it, and when several are ready, mark each and start them all in one reply, one delegate run per branch.',
      "Mark a step done with your evidence, what you ran and what it showed, as soon as its check passed and before you start the next; failed with a note when you can't finish it, and skipped with a note when it turned out unneeded.",
      'When the plan itself changes, set the map again before you go on',
      // Superseded by QA67-H9: details are given with the map (ADR 0102, 4).
      'Setting the map again keeps the status of each step whose id stays, and its details when you give none',
    ]) expect(executionMapDescription, phrase).toContain(phrase);
  });

  it('M2.4-E277 and E278 the map connector speaks of steps, never of tasks as its nodes', () => {
    const said = [executionMapDescription, ...Object.values(executionMapCommands).map((command) => command.description), JSON.stringify(payloadJsonSchema(executionMapCommands.set.payload)), JSON.stringify(payloadJsonSchema(executionMapCommands.update.payload))].join('\n');
    expect(said).toContain('Steps side by side are branches, and a branch means delegation');
    // "The task" is the person's request there; a node is never called one.
    expect(said.match(/\btasks\b|\b(?:a|each|one|ready) task\b/gi)).toBeNull();
    const lead = workingMethod('lead');
    for (const part of ['Map. ', 'Execute. ']) expect(lead.split('\n').find((line) => line.startsWith(part))?.replaceAll('does the task', '').match(/\btasks?\b/gi), part).toBeNull();
  });

  it('M2.4-E279 the map is the execution path, and a step is one stage of it', () => {
    expect(workingMethod('lead')).toContain('The map is the implementation plan the person reads and agrees to');
    expect(executionMapDescription).toContain('Plan work as the execution map: your execution path, and the implementation plan the person reads, agrees to, and watches as a diagram.');
    expect(executionMapDescription).toContain('A step is one concrete stage of the path, something you can name before you start it, never a phase such as implement or a whole feature: what gets done, who does it, and how it is checked; it may cover the few files that change together.');
    expect(workingMethod('lead')).not.toContain('a test, or a command to run');
  });

  it('M2.4-E280 who does a step is chosen by fit and named in uses, and Delegate allows a specialist', () => {
    const lead = workingMethod('lead');
    for (const phrase of [
      'Choose for each step whoever does it best and fastest: yourself, with a connector, for an ordinary or small change, or a worker of the `delegate` connector whose description fits when the step needs that skill.',
      // Superseded in part by QA71-H12 (ADR 0108, 4).
      'Delegate. A run is one deliverable of one kind: find (locate or explain), change (one change in the files it names), check (run commands or tests and diagnose), or review (review a finished change).',
      'never a question, a small change, work you already hold the context for, or work the person asked you to do. Ask for one review of a piece of work, not several.',
    ]) expect(lead, phrase).toContain(phrase);
    // Superseded by QA67-H10: the entry names no worker (ADR 0102, 4).
    expect(executionMapDescription).toContain('such as a design that is a real choice, a structure decision across several parts, or a review of a finished change that is risky or wide.');
    expect(lead).not.toContain('only when it is separate work');
  });

  it('M2.4-E281 a step that names a worker goes to it, and the map entry says who does a step', () => {
    expect(workingMethod('lead')).toContain('hand a step whose uses names a worker to that worker with `delegate run` and check its answer');
    expect(executionMapDescription).toContain('Its uses names who does it: you, with a connector such as fs, or a worker of delegate whose description in the delegate entry fits the step');
    expect(JSON.stringify(payloadJsonSchema(executionMapCommands.set.payload))).toContain('Who does the step: a connector such as fs, or a worker as delegate and its name; several as a list.');
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

  // Superseded in part by QA73-H1 and E8: every reply with a call starts with a sentence (ADR 0112, 1).
  it('M2.4-E301, E302, QA57-H8, QA73-H1, and QA73-E8 the lead talks in every reply with a call, and a worker does not get that rule', () => {
    const rule = 'Talk to the person as you work, the way a colleague does. Every reply that makes a call starts with one short sentence to the person: what you are doing and why, or what you just found and what you do next. Never send a reply that holds only calls.';
    for (const lead of [workingMethod('lead'), workingMethod('lead', 'general')]) {
      for (const phrase of [
        rule,
        "Say it in your own words, and don't repeat what the call's card already shows.",
        'Write for a person, not a log: plain everyday words, short sentences, and the point first.',
        'Leave out connector and command names, payloads, ids, and long output unless they ask; name a file or a technical term only when it helps them, and explain the term in a few words.',
        'Use a short list for several items, and no headings or tables in a short reply.',
      ]) expect(lead, phrase).toContain(phrase);
      expect(lead.split('\n')[1]?.startsWith(rule)).toBe(true);
      expect(lead).not.toContain("Don't announce routine calls");
      expect(lead).not.toContain('Leave out your inner steps');
      expect(lead).not.toContain('Say what you are about to do in the same reply');
    }
    for (const worker of [workingMethod('worker'), workingMethod('worker', 'general')]) {
      expect(worker).not.toContain(rule);
      expect(worker).not.toContain('Say what you are about to do in the same reply');
    }
  });

  // Shorter since QA73-H5 (ADR 0112, 3).
  it('M2.4-E307 the lead understands the goal behind the request, what exists, and what was left unsaid', () => {
    const understand = workingMethod('lead').split('\n').find((line) => line.startsWith('Understand. ')) ?? '';
    for (const phrase of [
      'Read everything the person sent, attached images and files too,',
      'and what already does part of it, so you build on it and not beside it.',
      'what done looks like to them',
      'what must keep working (other callers, stored data, settings, users)',
      'whether the means they named (a format, a library, a design) serves their goal',
      "what they didn't say that changes the result (who uses it, how much data or load, which platforms and languages, privacy and security)",
      'through a connector that reaches it rather than from memory',
    ]) expect(understand, phrase).toContain(phrase);
    expect(workingMethod('lead')).not.toContain('`docs get`');
  });

  it('M2.4-E308 and QA73-H6 the lead sorts what is open into look, decide, and ask, asks in one round, and never asks again for a go-ahead', () => {
    const clarify = workingMethod('lead').split('\n').find((line) => line.startsWith('Clarify. ')) ?? '';
    for (const phrase of [
      "A fact that looking would answer: look, don't ask.",
      'A decision only the person can make, or a gap that changes the result, the design, or stored data,',
      'or would break what exists: ask before any work.',
      'When the means they asked for works against their goal, or a clearly better way exists, say so and offer both before you build theirs.',
      'Look first, then ask everything in one round: every question in the same reply',
      'The person\'s go-ahead ("do it", "yes", or the option that starts, chosen after you said what you would do) answers what it covers: never ask it again.',
      'your recommended one first and each option saying what it leads to.',
    ]) expect(clarify, phrase).toContain(phrase);
  });

  it('M2.4-E309 the plan question says back what the lead understood, and the map goal is the outcome in the person\'s terms', () => {
    const lead = workingMethod('lead');
    expect(lead).toContain('say in a few lines what you understood (the goal, what done looks like, what stays as it is, and the choices you made for the person)');
    expect(lead).toContain('its question says those few lines, then asks whether to start');
    expect(executionMapDescription).toContain('Give the goal, the outcome the person wants in their own terms, then the steps.');
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

  // Superseded by QA67-H9: the map is set with each step's details in one call (ADR 0102, 4).
  it('QA54-H10 QA67-H9 the lead sets the map with each step detailed in Markdown, and asks once every step has details', () => {
    expect(workingMethod('lead')).toContain('Once every step has details (its undetailed list is empty), and before you start any step');
    for (const phrase of [
      "Give each step its details in the same set call: what it changes and how, naming the files or parts and the approach in words the person understands without the code, in Markdown, with lists, tables, and Mermaid diagrams or charts in fenced mermaid blocks, never SVG.",
      "The person opens them with a press, and a step can't be doing until it has them.",
      'Setting the map again keeps the status of each step whose id stays, and its details when you give none: give details again only for a step whose approach changed, and for each new step. Use detail to change one step\'s details on their own.',
      'Its check is the exact command you will run or the thing you will look at.',
    ]) expect(executionMapDescription, phrase).toContain(phrase);
    expect(workingMethod('lead')).not.toContain("A step's description");
    expect(executionMapDescription).toMatch(/Limits: goal up to 300 characters; 1 to 40 steps; [^.]*; a note of note up to 500\.$/);
  });
  it('QA60-H1 every method keeps working through a list or the ready steps, and reports once at the end', () => {
    const rule = 'Keep going until the work is done. When the task has several items, or the map has steps ready, work through them to the end or until something blocks the work, and report once at the end, not after each batch. Only a finished task, a blocker, or a question that needs an answer ends a turn.';
    for (const [role, method] of [['lead', 'engineering'], ['lead', 'general'], ['worker', 'engineering'], ['worker', 'general']] as const) {
      const lines = workingMethod(role, method).split('\n');
      expect(lines.at(-2), `${role} ${method}`).toBe(rule);
      expect(lines.at(-1), `${role} ${method}`).toMatch(/^A reply with no tool call is your final answer/);
    }
  });

});

describe('no testing instructions in the prompt (08 §8.2, ADR 0111)', () => {
  const testing = ['Testing:', 'Tests the person chose', 'Add unit tests', 'Check in proportion', 'run the whole suite', 'benchmark test', 'run its test', 'run the tests', 'tests pass'];

  it('QA72-H1 the lead says nothing about running, writing, or skipping tests; Commands holds commands only; a fix gets no map', () => {
    for (const decides of [false, true]) {
      const lead = workingMethod('lead', 'engineering', decides);
      for (const phrase of testing) expect(lead, `${phrase} ${String(decides)}`).not.toContain(phrase);
      expect(lead).toContain("it follows the project's conventions, and nothing unfinished or temporary is left behind.");
      expect(lead).toContain('make the smallest change that does it, check it, and fix a failure at its cause. A step is not done because you wrote it.');
      expect(lead).toContain('It holds only command lines, each with a few words of what it does, at most 15 lines: never notes, designs, or history.');
      expect(lead).toContain('A bug fix, a change to one or two files, or a fix the person described never gets a map.');
    }
  });

  it('QA72-H2 a worker says nothing about tests and proposes the smallest design', () => {
    const worker = workingMethod('worker');
    expect(worker).toContain('2. Do it. Make the smallest change, and propose the smallest design, that does the task; check it, and fix a failure at its cause. Write each file in its own call, with `fs write`.\n');
    for (const phrase of testing) expect(worker, phrase).not.toContain(phrase);
  });
});

describe('deliberating before a map, chosen apart from it (08 §8.2, ADR 0103, 6)', () => {
  const part = (method: string): string => method.split('\n').find((line) => line.startsWith('Deliberate. ')) ?? '';

  // Superseded in part by QA71-H22: deliberating runs only when the person asks (ADR 0108, 10).
  // Plan is Map since QA73-H5 (ADR 0112, 3).
  it('QA68-H6 and QA71-H22 the lead has Deliberate before Map, only when the person asks; Decide for me has the same', () => {
    for (const decides of [false, true]) {
      const lead = workingMethod('lead', 'engineering', decides);
      const names = lead.split('\n').map((line) => line.slice(0, line.indexOf('. ')));
      expect(names[names.indexOf('Deliberate') - 1]).toBe('Clarify');
      expect(names.indexOf('Map')).toBe(names.indexOf('Deliberate') + 1);
      for (const phrase of [
        'Only when the person asks for the approaches to be debated:',
        "before any map or change, hand it in one `delegate run` to the worker of the `delegate` connector that debates approaches, when its entry lists one",
        'the map\'s steps and details when your path has a map, or the work itself when it doesn\'t.',
        'Deliberating and mapping are separate choices, and deliberate once per request, not per step.',
      ]) expect(part(lead), phrase).toContain(phrase);
    }
  });

  it('QA68-E1 the part names no worker, and the map entry still names none', () => {
    expect(part(workingMethod('lead'))).not.toContain('council');
    expect(executionMapDescription).not.toContain('council');
  });

  it('QA68-E2 once per request, and no longer on its own for complex work (QA71-H22)', () => {
    expect(part(workingMethod('lead'))).toContain('deliberate once per request, not per step.');
    expect(part(workingMethod('lead'))).not.toContain('complex request whose approach is open');
  });

  it('QA71-H22 the lead tests nothing in the browser when the person tests it themselves, and sends map updates with the next work', () => {
    const lead = workingMethod('lead');
    expect(lead).toContain('When the person says they will test it themselves, start it, request its address once, give it to them, and stop, with no browser checks.');
    expect(lead).toContain("never spend a reply only on `execution-map update` but send it in the reply that makes the next piece of work's calls");
    expect(workingMethod('worker')).not.toContain('test it themselves');
  });

  it("QA68-E3 a worker's method and the general lead method have no Deliberate", () => {
    for (const method of [workingMethod('worker'), workingMethod('worker', 'general'), workingMethod('lead', 'general')]) expect(method).not.toContain('Deliberate');
  });
});

describe('the lead delegates when it pays, in the background (08 §8.2, ADR 0108, 1 and 4)', () => {
  it('QA71-H12 the Delegate part names the kinds, when to delegate, the brief, and that the lead never waits on a helper', () => {
    const lead = workingMethod('lead');
    for (const phrase of [
      "Delegate find, check, and review runs, and change runs only when two or more run at once on files that don't overlap; never a question, a small change, work you already hold the context for, or work the person asked you to do.",
      'goal is one sentence of what the run delivers, done one condition anyone can check, and context the line ranges the worker needs, whose text kvcoder attaches',
      'Every run goes on in the background: after starting workers, go on with what doesn\'t need them or end your turn; their answers come as messages that wake you, and you never wait for a helper with `background wait`.',
      'Never wait for a helper: its answer wakes you.',
    ]) expect(lead, phrase).toContain(phrase);
  });
});
