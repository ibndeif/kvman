import { describe, expect, it } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { commandEntry, setServers } from './support/mcp-servers.ts';
import { command, runs, says, systemPrompt, toolResults, type RunCallSpec } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';

const kvcoder = useKvcoder();
const step = (tool: string, input?: Record<string, unknown>) => ({ tool, ...(input === undefined ? {} : { arguments: input }) });
const run = (steps: unknown[], more: Record<string, unknown> = {}): RunCallSpec => command('mcp', 'run', { server: 'demo', steps, risky: false, ...more });
const call = (tool: string, input: Record<string, unknown> = {}): RunCallSpec => command('mcp', 'call', { server: 'demo', tool, arguments: input, risky: false });

async function started() {
  const world = await kvcoder.start();
  await setServers(world.kernel, [commandEntry()]);
  return { ...world, sessionId: await newSession(world.kernel) };
}

async function chat(...calls: RunCallSpec[]) {
  const world = await started();
  world.fake.reply(runs(...calls), says('ok'));
  await world.kernel.exec('kvcoder.message.send', { sessionId: world.sessionId, text: 'go' });
  await world.kernel.clock.advance(0);
  return { ...world, results: toolResults(world.fake) };
}

describe('several tools on one connection (08 §8.5, ADR 0070, 1 and 2)', { timeout: 60_000 }, () => {
  it('M2.4-E252 a run keeps the server between its tools, and two calls do not', async () => {
    const { results } = await chat(run([step('remember', { text: 'the page is open' }), step('recall')]), call('remember', { text: 'lost' }), call('recall'));
    expect(results[0]).toBe('## 1. remember\nkept\n\n## 2. recall\nthe page is open');
    expect(results.slice(1)).toEqual(['kept', '(nothing)']);
  });

  it('M2.4-E253 a run stops at the first tool that reports an error, and an unknown tool stops it before it starts', async () => {
    const { results } = await chat(run([step('echo', { text: 'one' }), step('fail'), step('echo', { text: 'three' })]), run([step('remember', { text: 'never' }), step('nope')]), run([step('recall')]));
    expect(results[0]).toBe('## 1. echo\none\n\n## 2. fail\nThe tool could not do that.\n\n[stopped: 1 step not run]');
    expect(results[1]).toMatch(/^error NOT_FOUND: demo has no tool nope\. Its tools are: /);
    expect(results[2]).toBe('## 1. recall\n(nothing)');
  });

  it('M2.4-E254 a risky run asks first, and a run of no step or of more than 20 is refused', async () => {
    const refused = await chat(run([]), run(Array.from({ length: 21 }, () => step('recall'))));
    for (const result of refused.results) expect(result).toMatch(/^error VALIDATION_FAILED: steps: /);
    const { kernel, fake, sessionId } = await started();
    fake.reply(runs(run([step('recall')], { risky: true })), says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    const [pending] = (await turnState(kernel, sessionId)).turn?.pending ?? [];
    expect(pending?.kind).toBe('approval');
    await kernel.exec('kvcoder.question.answer', { questionId: String(pending?.questionId), answer: { confirmed: true } });
    await kernel.clock.advance(0);
    expect(toolResults(fake)).toEqual(['## 1. recall\n(nothing)']);
  });

  it('M2.4-E255 the list says what each tool takes, and the prompt lists run and what it is for', async () => {
    const { fake, results } = await chat(command('mcp', 'tools', { server: 'demo' }));
    const listed = JSON.parse(results[0] ?? '{}') as { tools: { name: string; takes: string }[] };
    expect(listed.tools.filter((tool) => ['echo', 'recall', 'sleep'].includes(tool.name)).map((tool) => [tool.name, tool.takes])).toEqual([['echo', '{ text }'], ['sleep', '{ ms }'], ['recall', '{}']]);
    const prompt = systemPrompt(fake, 0);
    expect(prompt).toContain('keeps it only inside one run: put the tools that belong together (open the page, fill, click, read) in one run.');
    expect(prompt).toMatch(/\n {2}run +\{ server, steps: \[\{ tool, arguments\? \}\], timeoutMs\?, risky \}\n/);
    expect(prompt).toContain('creating, editing, or rewriting a file inside the workspace folder that the task needs, whoever made it');
  });
});
