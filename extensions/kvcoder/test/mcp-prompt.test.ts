import { describe, expect, it } from 'vitest';
import { z, type Json } from '@kvman/sdk';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { commandEntry, setServers } from './support/mcp-servers.ts';
import { command, requestTools, runs, says, systemPrompt, toolResults } from './support/model-script.ts';
import { newSession } from './support/turns.ts';
import { worker, workers } from './support/workers.ts';

const kvcoder = useKvcoder();

const enumSchema = z.object({ function: z.object({ parameters: z.object({ properties: z.object({ connector: z.object({ enum: z.array(z.string()) }) }) }) }) });
const connectorsOf = (tool: unknown): string[] => enumSchema.parse(tool).function.parameters.properties.connector.enum;

// A prompt's index entry for one connector: its header line and the lines under it.
function entry(prompt: string, name: string): string[] {
  const lines = (prompt.split('## Connectors\n')[1] ?? '').split('\n');
  const start = lines.findIndex((line) => line.startsWith(`- ${name}: `));
  if (start === -1) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => !line.startsWith('  '));
  return [lines[start] ?? '', ...rest.slice(0, end === -1 ? rest.length : end)];
}

const echo = command('mcp', 'call', { server: 'demo', tool: 'echo', arguments: { text: 'hi' }, risky: false });
const remote = { name: 'remote', description: 'Over HTTP', url: 'https://mcp.example.com/mcp', headers: [] };

async function turn(settings: Record<string, Json>, ...replies: Parameters<Awaited<ReturnType<typeof kvcoder.start>>['fake']['reply']>) {
  const world = await kvcoder.start({ settings });
  const sessionId = await newSession(world.kernel);
  world.fake.reply(...replies);
  await world.kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  await world.kernel.clock.advance(0);
  return world;
}

describe('the mcp connector in the prompt and the run tool (08 §8.2, ADR 0020, 10 and 12)', { timeout: 60_000 }, () => {
  it("QA29-H6 the index names the servers under mcp, with its commands' payloads, and run's enum has mcp", async () => {
    const { fake } = await turn({ 'kvcoder.mcp.servers': [commandEntry(), remote] }, says('ok'));
    const lines = entry(systemPrompt(fake), 'mcp');
    expect(lines[0]).toMatch(/^- mcp: Tools from the MCP servers the person added\. .* Servers: demo \(A demo server\), remote \(Over HTTP\)\.$/);
    expect(lines.slice(1)).toEqual(['  tools { server, tool? }', '  call  { server, tool, arguments?, timeoutMs?, risky }', '  help  { command? }']);
    expect(connectorsOf(requestTools(fake)[0])).toEqual(['shell', 'fs', 'artifact', 'background', 'ask', 'delegate', 'mcp', 'todo']);
  });

  it("QA29-H9 a workspace's own servers replace the global ones", async () => {
    const { kernel, fake } = await kvcoder.start({ settings: { 'kvcoder.mcp.servers': [commandEntry()] } });
    await setServers(kernel, [{ ...remote, name: 'other' }], 'workspace');
    const sessionId = await newSession(kernel);
    fake.reply(says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    expect(entry(systemPrompt(fake), 'mcp')[0]).toMatch(/ Servers: other \(Over HTTP\)\.$/);
  });

  it('QA29-E1 with no server mcp is in no prompt and no enum, the prompt is as it was, and a call gets the answer for no connector', async () => {
    const { kernel, fake } = await turn({}, runs(echo), says('ok'));
    const prompt = systemPrompt(fake, 0);
    expect(entry(prompt, 'mcp')).toEqual([]);
    expect(prompt).not.toContain('MCP');
    expect(connectorsOf(requestTools(fake, 0)[0])).toEqual(['shell', 'fs', 'artifact', 'background', 'ask', 'delegate', 'todo']);
    expect(toolResults(fake)).toEqual(['error VALIDATION_FAILED: There is no connector mcp. The connectors are: shell, fs, artifact, background, ask, delegate, todo.']);
    expect((await kernel.exec('kvcoder.connector.list', {})).map((connector) => connector.name)).toEqual(['todo']);
  });

  it('QA29-E2 turned off, mcp is left out although it has servers', async () => {
    const { fake } = await turn({ 'kvcoder.mcp.servers': [commandEntry()], 'kvcoder.connectors.disabled': ['mcp'] }, runs(echo), says('ok'));
    expect(entry(systemPrompt(fake, 0), 'mcp')).toEqual([]);
    expect(toolResults(fake)[0]).toMatch(/^error VALIDATION_FAILED: There is no connector mcp\. /);
  });

  it('QA29-E3 a subagent calls mcp when it was given it, and not otherwise', async () => {
    const helper = runs(command('delegate', 'run', { worker: 'helper', title: 'Helper', task: 'Use the tool' }));
    const given = await turn({ 'kvcoder.mcp.servers': [commandEntry()], ...workers(worker('helper', { connectors: ['mcp'] })) }, helper, runs(echo), says('child done'), says('parent done'));
    expect(connectorsOf(requestTools(given.fake, 1)[0])).toEqual(['ask', 'mcp']);
    expect(toolResults(given.fake, 2)).toEqual(['hi']);
    const withheld = await turn({ 'kvcoder.mcp.servers': [commandEntry()], ...workers(worker('helper', { connectors: ['fs'] })) }, helper, runs(echo), says('child done'), says('parent done'));
    expect(toolResults(withheld.fake, 2)).toEqual(["error VALIDATION_FAILED: mcp isn't available in this subagent."]);
  });
});
