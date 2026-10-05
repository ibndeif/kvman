import { describe, expect, it } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { fixtureTools } from './support/mcp-fixture-server.ts';
import { commandEntry, setServers } from './support/mcp-servers.ts';
import { command, runs, says, toolResults, type RunCallSpec } from './support/model-script.ts';
import { newSession } from './support/turns.ts';

const kvcoder = useKvcoder();

const call = (tool: string, input: Record<string, unknown> = {}, more: Record<string, unknown> = {}): RunCallSpec => command('mcp', 'call', { server: 'demo', tool, arguments: input, risky: false, ...more });

// The model's `mcp` calls through a real turn, against the fixture run as a command.
async function run(commands: readonly RunCallSpec[]) {
  const { kernel, fake } = await kvcoder.start();
  await setServers(kernel, [commandEntry()]);
  const sessionId = await newSession(kernel);
  fake.reply(runs(...commands), says('ok'));
  await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  await kernel.clock.advance(0);
  return { results: toolResults(fake), kernel, sessionId };
}

const json = (text: string | undefined): unknown => JSON.parse(String(text));

describe('the mcp connector over a command server (08 §8.5, ADR 0020, 3 and 4)', { timeout: 60_000 }, () => {
  it("QA29-H1 and QA29-H2 tools lists a server's tools, and gives one tool's arguments", async () => {
    const { results } = await run([command('mcp', 'tools', { server: 'demo' }), command('mcp', 'tools', { server: 'demo', tool: 'echo' })]);
    expect(json(results[0])).toMatchObject({ server: 'demo', tools: fixtureTools.map((name) => ({ name })) });
    expect(json(results[0])).toMatchObject({ tools: expect.arrayContaining([{ name: 'echo', description: 'Returns the text it is given.' }]) });
    expect(json(results[1])).toEqual({ server: 'demo', name: 'echo', description: 'Returns the text it is given.', arguments: { type: 'object', properties: { text: { type: 'string', description: 'The text to return.' } }, required: ['text'] } });
  });

  it("QA29-H3 call returns the tool's text, runs in the workspace folder, and its card names mcp and call", async () => {
    const { results, kernel, sessionId } = await run([call('echo', { text: 'hi' }), call('cwd')]);
    expect(results).toEqual(['hi', kernel.homeFolder]);
    const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
    const card = messages.find((message) => message.kind === 'toolResult')?.content['details'];
    expect(card).toMatchObject({ connector: 'mcp', command: 'call', output: 'hi' });
  });

  it('QA29-E4 an unknown server fails kvcoder/MCP_SERVER_NOT_FOUND, naming the servers', async () => {
    const { results, kernel } = await run([command('mcp', 'tools', { server: 'nope' }), command('mcp', 'call', { server: 'nope', tool: 'echo', risky: false })]);
    expect(results).toEqual(Array.from({ length: 2 }, () => 'error kvcoder/MCP_SERVER_NOT_FOUND: There is no MCP server nope. The servers are: demo.'));
    await expect(kernel.exec('kvcoder.mcp.server.check', { name: 'nope' })).rejects.toMatchObject({ problem: { code: 'kvcoder/MCP_SERVER_NOT_FOUND', params: { server: 'nope' } } });
  });

  it('QA29-E5 an unknown tool fails NOT_FOUND, naming the tools', async () => {
    const { results } = await run([command('mcp', 'tools', { server: 'demo', tool: 'nope' }), call('nope')]);
    expect(results).toEqual(Array.from({ length: 2 }, () => `error NOT_FOUND: demo has no tool nope. Its tools are: ${fixtureTools.join(', ')}.`));
  });

  it('QA29-E6 and QA29-E7 a tool that reports an error is an error result, and a block that is not text is named', async () => {
    const { results, kernel, sessionId } = await run([call('fail'), call('picture')]);
    expect(results).toEqual(['The tool could not do that.', 'A picture:\n\n[image omitted]']);
    const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
    expect(messages.filter((message) => message.kind === 'toolResult').map((message) => message.content['isError'])).toEqual([true, false]);
  });

  it('QA29-E8 a long result keeps its first and last 15 KB', async () => {
    const { results } = await run([call('big')]);
    const [result = ''] = results;
    expect(result.startsWith('START')).toBe(true);
    expect(result.endsWith('END')).toBe(true);
    expect(result).toMatch(/\n\[… \d+ bytes omitted …\]\n/);
    expect(Buffer.byteLength(result)).toBeLessThan(31 * 1024);
  });

  it('QA29-E21 help lists the commands, and one command with every field described', async () => {
    const { results } = await run([command('mcp', 'help'), command('mcp', 'help', { command: 'call' })]);
    expect(results[0]).toContain('tools');
    expect(results[0]).toContain("Calls one tool of an MCP server and returns the tool's text.");
    for (const field of ['server', 'tool', 'arguments', 'timeoutMs', 'risky']) expect(results[1], field).toContain(`"${field}"`);
    expect(results[1]).toContain('The MCP server, by the name the system prompt lists.');
    expect(results[1]).toContain("the tool's text.");
  });
});
