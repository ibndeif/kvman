import { describe, expect, it } from 'vitest';
import { shippedWorkers } from '../src/delegate/workers.ts';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, requestTools, runs, says, shell, systemPrompt, toolResults, withoutHelperId } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';
import { worker, workers } from './support/workers.ts';

const kvcoder = useKvcoder();

const reviewer = shippedWorkers.find((entry) => entry.name === 'reviewer');
const descriptions = ['Any separate, self-contained task', 'Designs the experience and the look of a screen or flow, to usability and accessibility standards', "Designs the structure of a change, on sound engineering practice and the project's own patterns and conventions", 'QA engineer: writes and runs test cases, automated and by hand as a person would, on the critical flows, security, and performance, and reports the issues', 'Reviews code and reports wrong style, needless complexity, and unclean or unclear code', "A council that debates a complex request whose approach is open (an engineer, a devil's advocate, a dumb customer, and the field's top expert) until its fatal flaws are fixed, and returns the final plan; for complex work only, before any execution map"];
// The index's names of the shipped workers, less the ones `off` names.
const named = (...off: string[]): string => shippedWorkers.map((entry, index) => ({ entry, index })).filter(({ entry }) => !off.includes(entry.name)).map(({ entry, index }) => `${entry.name} (${descriptions[index]}${entry.readOnly ? '; read-only' : ''})`).join(', ');
const delegate = (name: string, task = 'Do it') => command('delegate', 'run', { worker: name, title: 'Helper', task });
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
    const { fake } = await turn({}, runs(command('subagent', 'run', { task: 'x', mode: 'fresh' })), says('done'));
    const prompt = systemPrompt(fake, 0);
    expect(prompt.split('\n').filter((line) => line.startsWith('- ')).map((line) => line.slice(2, line.indexOf(':')))).toEqual(['shell', 'fs', 'artifact', 'execution-map', 'background', 'ask', 'delegate', 'web', 'todo']);
    expect(prompt).not.toContain('- subagent: ');
    expect(prompt).toContain('\n  run      { worker, title (≤200), task, background? }\n  continue { id, message, background? }\n  help     { command? }');
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

  it("QA31-H4 a run starts a child with the worker's instructions, and its answer is the result", async () => {
    const { kernel, fake } = await kvcoder.start();
    await kernel.exec('kvcoder.section.set', { id: 'guide', title: 'Guide', order: 1, global: true, content: 'Read the guide.' }, { as: '@test/todo' });
    const sessionId = await newSession(kernel);
    fake.reply(runs(delegate('reviewer', 'Review src/a.ts')), says('two defects'), says('parent done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    expect(reviewer?.instructions).toMatch(/^You are a senior code reviewer\./);
    expect(systemPrompt(fake, 1)).toContain(`## Guide\nRead the guide.\n\n## Worker: reviewer\n${reviewer?.instructions ?? ''}\n\nYou are read-only here: `);
    expect(systemPrompt(fake, 1)).toMatch(/so don't make one; say what should change and why\.\n\n## Connectors\n/);
    expect(fake.requests()[1]?.body).toMatchObject({ messages: [expect.anything(), { role: 'user', content: 'Review src/a.ts' }] });
    expect(toolResults(fake, 2).map(withoutHelperId)).toEqual(['two defects']);
    expect(systemPrompt(fake, 0)).not.toContain('## Worker:');
  });

  it("QA31-H5 a worker's connectors are its child's, without ask", async () => {
    const { fake } = await turn(workers(worker('files', { connectors: ['fs'] })), runs(delegate('files')), runs(shell('echo hi')), says('child done'), says('parent done'));
    const child = systemPrompt(fake, 1);
    expect(child.split('\n').filter((line) => line.startsWith('- ')).map((line) => line.slice(2, line.indexOf(':')))).toEqual(['fs']);
    expect(toolResults(fake, 2)).toEqual(["error VALIDATION_FAILED: shell isn't available in this subagent."]);
  });

  // QA67-H7: a worker that names no level gets kvcoder.delegate.thinking, medium by default (ADR 0102, 3).
  it("QA31-H6 a worker's model and thinking are its child's, the parent's model and the helpers' level when they are null", async () => {
    const settings = workers(worker('own', { model: 'fake/m2', thinking: 'high' }), worker('same'));
    const { kernel, fake, sessionId } = await turn(settings, runs(delegate('own'), delegate('same')), runs(shell('true', { risky: true })), runs(shell('true', { risky: true })));
    const pending = (await turnState(kernel, sessionId)).turn?.pending ?? [];
    const children = await Promise.all(pending.map((item) => kernel.exec('kvcoder.session.get', { sessionId: String(item.childSessionId) })));
    expect(children.map((child) => [child.worker, child.model, child.thinking])).toEqual([['own', 'fake/m2', 'high'], ['same', 'fake/m1', 'medium']]);
    expect(fake.requests().map((request) => (request.body as { model: string }).model).sort()).toEqual(['m1', 'm1', 'm2']);
  });

  it('QA31-H7 general has no worker block', async () => {
    const { fake } = await turn({}, runs(delegate('general')), says('child done'), says('parent done'));
    expect(systemPrompt(fake, 1)).not.toContain('## Worker:');
    expect(toolResults(fake, 2).map(withoutHelperId)).toEqual(['child done']);
  });

  it('QA31-H8 a child session names its worker, and a top-level one has none', async () => {
    const { kernel, sessionId } = await turn({}, runs(delegate('tester')), runs(shell('true', { risky: true })));
    const { session, turn: parentTurn } = await turnState(kernel, sessionId);
    expect('worker' in session).toBe(false);
    const child = await kernel.exec('kvcoder.session.get', { sessionId: String(parentTurn?.pending[0]?.childSessionId) });
    expect(child).toMatchObject({ worker: 'tester', parentId: sessionId });
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
    const { fake } = await turn({}, runs(command('delegate', 'run', { task: 'x', mode: 'fresh' })), says('done'));
    const [refused] = toolResults(fake);
    expect(refused).toMatch(/^error VALIDATION_FAILED: /);
    expect(refused).toContain('worker: ');
    expect(refused).toContain('Unrecognized key: "mode"');
    expect(refused?.endsWith('The payload of delegate run is\n{ worker, title (≤200), task, background? }')).toBe(true);
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
