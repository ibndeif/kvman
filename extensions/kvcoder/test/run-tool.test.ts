import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { rawCall, requestTools, runs, says, toolResults, type RunCallSpec } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';
import type { FakeReply } from '@kvman/testkit/fake-openai';

const kvcoder = useKvcoder();

// One reply of the model through a real turn (08 §8.2 and §8.3): what its calls returned, as the next request shows them.
async function turn(reply: FakeReply) {
  const world = await kvcoder.start();
  const sessionId = await newSession(world.kernel);
  world.fake.reply(reply, says('ok'));
  await world.kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  await world.kernel.clock.advance(0);
  return { ...world, sessionId, results: toolResults(world.fake) };
}

const call = (spec: RunCallSpec) => turn(runs(spec));

const toolSchema = z.object({ function: z.object({ name: z.string(), parameters: z.object({ properties: z.record(z.string(), z.object({ enum: z.array(z.string()).optional() })), required: z.array(z.string()) }) }) });

describe('the run tool (08 §8.2 and §8.3, ADR 0011)', { timeout: 30_000 }, () => {
  it('QA18-H1 the one tool is run, with the session\'s connectors as an enum', async () => {
    const { fake } = await call({ connector: 'todo', command: 'list' });
    const tools = requestTools(fake, 0).map((tool) => toolSchema.parse(tool).function);
    expect(tools.map((tool) => tool.name)).toEqual(['run']);
    expect(Object.keys(tools[0]?.parameters.properties ?? {})).toEqual(['description', 'connector', 'command', 'payload']);
    expect(tools[0]?.parameters.required).toEqual(['description', 'connector', 'command']);
    expect(tools[0]?.parameters.properties['connector']?.enum).toEqual(['shell', 'fs', 'artifact', 'background', 'ask', 'delegate', 'todo']);
  });

  it('QA18-H2 a commands connector runs with the payload as its input and returns indented JSON', async () => {
    const { results, kernel } = await call({ connector: 'todo', command: 'add', payload: { text: 'milk' } });
    const added = z.object({ id: z.string(), text: z.string() }).parse(JSON.parse(results[0] ?? ''));
    expect(results[0]).toBe(JSON.stringify(added, null, 2));
    expect(results[0]).not.toContain('[exit code');
    expect(await kernel.exec('todo.item.list', {})).toEqual([{ text: 'milk' }]);
  });

  it('QA18-H15 ask waits on the person, and the answer is the result as JSON', async () => {
    const { kernel, fake, sessionId } = await call({ connector: 'ask', command: 'confirm', payload: { prompt: 'Go on?' } });
    const { session, turn: waiting } = await turnState(kernel, sessionId);
    expect(session.status).toBe('waiting');
    const questionId = z.object({ questionId: z.string() }).parse(waiting?.pending[0]).questionId;
    await kernel.exec('kvcoder.question.answer', { questionId, answer: { confirmed: true } });
    await kernel.clock.advance(0);
    expect(toolResults(fake)).toEqual([JSON.stringify({ confirmed: true }, null, 2)]);
  });

  it('QA18-E1 another tool is refused, and the turn goes on', async () => {
    const { results, kernel, sessionId } = await turn(rawCall('bash', { command: 'ls' }));
    expect(results).toEqual(["error VALIDATION_FAILED: The call's arguments are invalid: the tool is run, not bash."]);
    expect((await turnState(kernel, sessionId)).turn?.outcome).toBe('done');
  });

  it('QA18-E2 a payload sent as a JSON string is parsed, and one that holds no object is refused', async () => {
    const parsed = await turn(rawCall('run', { description: 'Adding milk.', connector: 'todo', command: 'add', payload: '{"text":"milk"}' }));
    expect(await parsed.kernel.exec('todo.item.list', {})).toEqual([{ text: 'milk' }]);
    for (const payload of ['not json', '[1]', '"text"']) {
      const refused = await turn(rawCall('run', { description: 'Adding milk.', connector: 'todo', command: 'add', payload }));
      expect(refused.results[0], payload).toContain('payload: The payload must be a JSON object');
      expect(await refused.kernel.exec('todo.item.list', {})).toEqual([]);
    }
  });

  it('QA18-E3 a missing or blank description fails and nothing runs', async () => {
    for (const description of [undefined, '   ']) {
      const { results, kernel } = await turn(rawCall('run', { ...(description === undefined ? {} : { description }), connector: 'todo', command: 'add', payload: { text: 'milk' } }));
      expect(results[0]).toMatch(/^error VALIDATION_FAILED: The call's arguments are invalid: description: .+ \(it must be one sentence saying what this call does, for the person\)\. Call run again with the arguments fixed\.$/);
      expect(await kernel.exec('todo.item.list', {})).toEqual([]);
    }
  });

  it("QA18-E4 an unknown connector names the connectors, and an unknown command names the connector's commands", async () => {
    const connector = await call({ connector: 'nope', command: 'add' });
    expect(connector.results[0]).toBe('error VALIDATION_FAILED: There is no connector nope. The connectors are: shell, fs, artifact, background, ask, delegate, todo.');
    const command = await call({ connector: 'todo', command: 'remove' });
    expect(command.results[0]).toBe('error NOT_FOUND: todo has no command remove. Its commands are: add, wait, fail, list, help.');
  });

  it('QA19-E15 a shell line sent as the command is cut, and the error names the commands', async () => {
    const line = 'node -e "console.log(1)" && echo a long line that is not a command name';
    const { results } = await call({ connector: 'shell', command: line });
    expect(results[0]).toBe(`error NOT_FOUND: shell has no command ${line.slice(0, 40)}…. Its commands are: exec { line, background?, timeoutMs?, risky }, help.`);
  });

  it('QA18-E5 an invalid payload returns each problem and the payload signature', async () => {
    const builtin = await call({ connector: 'fs', command: 'edit', payload: { file: 'a' } });
    expect(builtin.results[0]).toMatch(/^error VALIDATION_FAILED: .*path: .*The payload of fs edit is\n\{ path, edits: \[\{ oldText, newText \}\], risky \}$/s);
    const registered = await call({ connector: 'todo', command: 'add', payload: { text: 7 } });
    expect(registered.results[0]).toMatch(/^error VALIDATION_FAILED: text: .*The payload of todo add is\n\{ text \}$/s);
  });

  it('QA18-E6 a call with no payload runs with an empty one', async () => {
    const { results } = await call({ connector: 'todo', command: 'list' });
    expect(results[0]).toBe('[]');
  });

  it('QA18-E16 no connector command runs in the background, and no call of a turn makes a job row', async () => {
    const { results, kernel } = await call({ connector: 'todo', command: 'add', payload: { text: 'milk', background: true } });
    expect(await kernel.exec('todo.item.list', {})).toEqual([{ text: 'milk' }]);
    expect(results[0]).not.toContain('started');
    const jobs = await kernel.exec('kernel.jobs.list', { limit: 100 });
    expect(jobs.map((job) => job.name).filter((name) => name.startsWith('todo.') || name.startsWith('kvcoder.connector'))).toEqual([]);
  });
});
