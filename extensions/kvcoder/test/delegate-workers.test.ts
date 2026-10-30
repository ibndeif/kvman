import { describe, expect, it } from 'vitest';
import { shippedWorkers } from '../src/delegate/workers.ts';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, requestTools, runs, says, shell, systemPrompt, toolResults } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';
import { delegated, helperIds } from './support/helpers.ts';
import { worker, workers } from './support/workers.ts';

const kvcoder = useKvcoder();

const reviewer = shippedWorkers.find((entry) => entry.name === 'reviewer');
const descriptions = ['Any separate, self-contained task', 'Designs the experience and the look of a screen or flow, to usability and accessibility standards', "Designs the structure of a change, on sound engineering practice and the project's own patterns and conventions", 'QA engineer: writes and runs test cases, automated and by hand as a person would, on the critical flows, security, and performance, and reports the issues', 'Reviews code and reports wrong style, needless complexity, and unclean or unclear code', "A council that debates a complex request whose approach is open (an engineer, a devil's advocate, a dumb customer, and the field's top expert) until its fatal flaws are fixed, and returns the final plan; for complex work only, before any execution map"];
// The index's names of the shipped workers, less the ones `off` names.
const named = (...off: string[]): string => shippedWorkers.map((entry, index) => ({ entry, index })).filter(({ entry }) => !off.includes(entry.name)).map(({ entry, index }) => `${entry.name} (${descriptions[index]}${entry.readOnly ? '; read-only' : ''})`).join(', ');
const delegate = (name: string, task = 'Do it') => command('delegate', 'run', { worker: name, title: 'Helper', kind: 'find', goal: task, done: 'It is done.' });
const indexLine = (prompt: string, connector: string): string => prompt.split('\n').find((line) => line.startsWith(`- ${connector}: `)) ?? '';

async function turn(settings: Record<string, unknown>, ...replies: Parameters<Awaited<ReturnType<typeof kvcoder.start>>['fake']['reply']>) {
  const world = await kvcoder.start({ settings: settings as never });
  const sessionId = await newSession(world.kernel);
  world.fake.reply(...replies);
  await world.kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  await world.kernel.clock.advance(0);
  return { ...world, sessionId };
}

describe('the delegate connector and its workers (08 §8.5, ADR 0021)', { timeout: 30_000 }, () => {
  it('QA31-H1 delegate replaces subagent: the index, the run line, and a call to subagent', async () => {
    const { fake } = await turn({}, runs(command('subagent', 'run', { kind: 'find', goal: 'x', done: 'It is done.', mode: 'fresh' })), says('done'));
    const prompt = systemPrompt(fake, 0);
    expect(prompt.split('\n').filter((line) => line.startsWith('- ')).map((line) => line.slice(2, line.indexOf(':')))).toEqual(['shell', 'fs', 'artifact', 'execution-map', 'background', 'ask', 'delegate', 'web', 'todo']);
    expect(prompt).not.toContain('- subagent: ');
    expect(prompt).toContain('\n  run      { worker, title (≤200), kind: "find" | "change" | "check" | "review", goal (≤300), done (≤300), files?, context?: [{ path, fromLine?, lines? }], budget? }\n  continue { id, message }\n  help     { command? }');
    expect(toolResults(fake)).toEqual(['error VALIDATION_FAILED: There is no connector subagent. The connectors are: shell, fs, artifact, execution-map, background, ask, delegate, web, todo.']);
  });

  // Superseded by QA68-H1 and QA68-H3: six workers, the council thinking at high (ADR 0103).
  it('QA31-H2 the shipped workers are six subagents that differ by their instructions', async () => {
    const { kernel } = await kvcoder.start();
    const setting = (await kernel.exec('kernel.settings.list', {})).find((candidate) => candidate.key === 'kvcoder.delegate.workers');
    expect(setting?.value).toEqual(shippedWorkers);
    expect(shippedWorkers.map((entry) => entry.name)).toEqual(['general', 'ui-ux', 'architect', 'tester', 'reviewer', 'council']);
    for (const entry of shippedWorkers) expect(entry).toMatchObject({ enabled: true, kind: 'subagent', connectors: null, model: null, thinking: entry.name === 'council' ? 'high' : null });
    expect(shippedWorkers.map((entry) => entry.description)).toEqual(descriptions);
    expect(shippedWorkers[0]?.instructions).toBe('');
    expect(shippedWorkers.slice(1).map((entry) => entry.instructions.split('.')[0])).toEqual(['You are a senior UI/UX designer', 'You are a senior software architect', 'You are a senior QA engineer', 'You are a senior code reviewer', "You are not an assistant, and you don't give the answer now"]);
  });

  // Superseded by QA68-H1: the list ends with the council (ADR 0103, 1).
  it('QA31-H3 the index names the workers', async () => {
    const { fake } = await turn({}, says('done'));
    expect(indexLine(systemPrompt(fake, 0), 'delegate').endsWith(`Workers: ${named()}.`)).toBe(true);
  });

  it("QA31-H4 a run starts a child with the worker's instructions, and its answer comes back as a message", async () => {
    const world = await kvcoder.start();
    const { kernel, fake, helperFake } = world;
    await kernel.exec('kvcoder.section.set', { id: 'guide', title: 'Guide', order: 1, global: true, content: 'Read the guide.' }, { as: '@test/todo' });
    const sessionId = await newSession(kernel);
    await delegated(world, sessionId, [runs(delegate('reviewer', 'Review src/a.ts')), says('Started.'), says('parent done')], [says('two defects')]);
    expect(reviewer?.instructions).toMatch(/^You are a senior code reviewer\./);
    expect(systemPrompt(helperFake, 0)).toContain(`## Guide\nRead the guide.\n\n## Worker: reviewer\n${reviewer?.instructions ?? ''}\n\nYou are read-only here: `);
    expect(systemPrompt(helperFake, 0)).toMatch(/so don't make one; say what should change and why\.\n\n## Connectors\n/);
    expect(helperFake.requests()[0]?.body).toMatchObject({ messages: [expect.anything(), { role: 'user', content: 'Kind: find\nGoal: Review src/a.ts\nDone when: It is done.' }] });
    expect(JSON.stringify(fake.requests().at(-1)?.body)).toContain('finished:\\ntwo defects');
    expect(systemPrompt(fake, 0)).not.toContain('## Worker:');
  });

  it("QA31-H5 a worker's connectors are its child's, without ask", async () => {
    const world = await kvcoder.start({ settings: workers(worker('files', { connectors: ['fs'] })) as never });
    const sessionId = await newSession(world.kernel);
    await delegated(world, sessionId, [runs(delegate('files')), says('Started.'), says('parent done')], [runs(shell('echo hi')), says('child done')]);
    const child = systemPrompt(world.helperFake, 0);
    expect(child.split('\n').filter((line) => line.startsWith('- ')).map((line) => line.slice(2, line.indexOf(':')))).toEqual(['fs']);
    expect(toolResults(world.helperFake, 1)).toEqual(["error VALIDATION_FAILED: shell isn't available in this subagent."]);
  });

  // QA67-H7: a worker that names no level gets kvcoder.delegate.thinking, medium by default (ADR 0102, 3).
  it("QA31-H6 a worker's model and thinking are its child's, the parent's model and the helpers' level when they are null", async () => {
    const world = await kvcoder.start({ settings: { ...workers(worker('own', { model: 'helper/m1', thinking: 'high' }), worker('same')), 'kvcoder.delegate.model': null } as never });
    const sessionId = await newSession(world.kernel);
    // 'same' asks the lead's own server, so every reply there is the same: whichever asks first gets one.
    await delegated(world, sessionId, [runs(delegate('own'), delegate('same')), ...Array.from({ length: 5 }, () => says('ok'))], [says('own done')]);
    const children = await Promise.all((await helperIds(world.kernel, sessionId)).map((id) => world.kernel.exec('kvcoder.session.get', { sessionId: id })));
    expect(children.map((child) => [child.worker, child.model, child.thinking])).toEqual([['own', 'helper/m1', 'high'], ['same', 'fake/m1', 'medium']]);
  });

  it('QA31-H7 general has no worker block', async () => {
    const world = await kvcoder.start();
    const sessionId = await newSession(world.kernel);
    await delegated(world, sessionId, [runs(delegate('general')), says('Started.'), says('parent done')], [says('child done')]);
    expect(systemPrompt(world.helperFake, 0)).not.toContain('## Worker:');
    expect(JSON.stringify(world.fake.requests().at(-1)?.body)).toContain('finished:\\nchild done');
  });

  it('QA31-H8 a child session names its worker, and a top-level one has none', async () => {
    const world = await kvcoder.start();
    const sessionId = await newSession(world.kernel);
    await delegated(world, sessionId, [runs(delegate('tester')), says('Started.'), says('Read it.')], [says('tested')]);
    expect('worker' in (await world.kernel.exec('kvcoder.session.get', { sessionId }))).toBe(false);
    const [childId = ''] = await helperIds(world.kernel, sessionId);
    expect(await world.kernel.exec('kvcoder.session.get', { sessionId: childId })).toMatchObject({ worker: 'tester', parentId: sessionId });
  });

  // Superseded by QA68-H1: the list ends with the council (ADR 0103, 1).
  it('QA31-H9 a worker that is turned off is not named, and a run of it fails', async () => {
    const settings = workers(...shippedWorkers.map((entry) => ({ ...entry, enabled: entry.name !== 'reviewer' })));
    const { fake } = await turn(settings, runs(delegate('reviewer')), says('done'));
    expect(indexLine(systemPrompt(fake, 0), 'delegate')).toContain(`Workers: ${named('reviewer')}.`);
    expect(toolResults(fake)).toEqual(['error kvcoder/WORKER_NOT_FOUND: There is no worker reviewer. The workers are: general, ui-ux, architect, tester, council.']);
  });

  // Superseded by QA68-H1: the list ends with the council (ADR 0103, 1).
  it('QA31-E1 an unknown worker fails, and no child starts', async () => {
    const { kernel, fake, sessionId } = await turn({}, runs(delegate('nobody')), says('done'));
    expect(toolResults(fake)).toEqual(['error kvcoder/WORKER_NOT_FOUND: There is no worker nobody. The workers are: general, ui-ux, architect, tester, reviewer, council.']);
    expect(fake.requests()).toHaveLength(2);
    expect((await turnState(kernel, sessionId)).turn).toMatchObject({ outcome: 'done', pending: [] });
  });

  it('QA31-E2 the old payload is refused with what the command takes', async () => {
    const { fake } = await turn({}, runs(command('delegate', 'run', { kind: 'find', goal: 'x', done: 'It is done.', mode: 'fresh' })), says('done'));
    const [refused] = toolResults(fake);
    expect(refused).toMatch(/^error VALIDATION_FAILED: /);
    expect(refused).toContain('worker: ');
    expect(refused).toContain('Unrecognized key: "mode"');
    expect(refused?.includes('The payload of delegate run is\n{ worker, title (≤200), kind: "find" | "change" | "check" | "review", goal (≤300), done (≤300), files?, context?: [{ path, fromLine?, lines? }], budget? }\n\n')).toBe(true);
  });

  it.each([
    ['every worker turned off', workers(...shippedWorkers.map((entry) => ({ ...entry, enabled: false })))],
    ['an empty list', workers()],
  ])('QA31-E3 with no worker available (%s), delegate is not a connector of the chat', async (_case, settings) => {
    const { fake } = await turn(settings, runs(delegate('general')), says('done'));
    expect(systemPrompt(fake, 0)).not.toContain('- delegate: ');
    expect(JSON.stringify(requestTools(fake, 0))).not.toContain('"delegate"');
    expect(toolResults(fake)).toEqual(['error VALIDATION_FAILED: There is no connector delegate. The connectors are: shell, fs, artifact, execution-map, background, ask, web, todo.']);
  });
});

describe('the council in a saved list (ADR 0103, 7)', { timeout: 30_000 }, () => {
  it('QA68-E4 a list saved without the council keeps its entries, and a run of the council fails naming them', async () => {
    const { fake } = await turn(workers(...shippedWorkers.filter((entry) => entry.name !== 'council')), runs(delegate('council')), says('done'));
    expect(toolResults(fake)).toEqual(['error kvcoder/WORKER_NOT_FOUND: There is no worker council. The workers are: general, ui-ux, architect, tester, reviewer.']);
  });

  it('QA68-E5 the council turned off is left out of the index', async () => {
    const { fake } = await turn(workers(...shippedWorkers.map((entry) => ({ ...entry, enabled: entry.name !== 'council' }))), says('done'));
    expect(indexLine(systemPrompt(fake, 0), 'delegate').endsWith(`Workers: ${named('council')}.`)).toBe(true);
  });
});
