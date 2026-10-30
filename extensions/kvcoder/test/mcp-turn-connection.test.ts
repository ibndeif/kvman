import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from '@kvman/sdk';
import type { TestKernel } from '@kvman/testkit';
import { heldReply } from './support/held-reply.ts';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { freePort, keptEntry, setServers, startSessionFixture, type HttpFixture } from './support/mcp-servers.ts';
import { command, runs, says, toolResults } from './support/model-script.ts';
import { newSession } from './support/turns.ts';
import { wait } from './support/wait.ts';

// A server over HTTP, or a command run with a port, is kept for the turn: its calls share one MCP session, and the
// turn's end stops it (plan 08 §8.5, ADR 0108, 12).

const kvcoder = useKvcoder();
const fixtures: HttpFixture[] = [];
afterEach(async () => { for (const fixture of fixtures.splice(0)) await fixture.close(); });

const call = (server: string, tool: string, args: Record<string, unknown> = {}) => command('mcp', 'call', { server, tool, arguments: args, risky: false });
const running = async (kernel: TestKernel): Promise<string[]> => z.array(z.object({ extension: z.string(), name: z.string() })).parse(await kernel.exec('kernel.processes.list', {})).filter((process) => process.extension === '@kvman/kvcoder' && process.name.startsWith('mcp-')).map((process) => process.name);

async function chat(entry: Record<string, unknown>) {
  const { kernel, fake } = await kvcoder.start();
  await setServers(kernel, [entry as never]);
  const sessionId = await newSession(kernel);
  const turn = async (...replies: Parameters<typeof fake.reply>): Promise<string[]> => {
    const before = toolResults(fake).length;
    fake.reply(...replies);
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    return toolResults(fake).slice(before);
  };
  return { kernel, fake, sessionId, turn };
}

describe('MCP servers kept for the turn (ADR 0108, 12)', { timeout: 60_000 }, () => {
  it('QA71-H24 a command with a port starts once for the turn, its calls share the session, and the turn\'s end stops it', async () => {
    const { kernel, turn } = await chat(keptEntry(await freePort()));
    const first = await turn(runs(call('kept', 'remember', { text: 'the page' })), runs(command('mcp', 'tools', { server: 'kept' })), runs(call('kept', 'recall')), says('ok'));
    expect(first[0]).toBe('kept');
    expect(first[2]).toBe('the page');
    expect(await running(kernel)).toEqual([]);
    const second = await turn(runs(call('kept', 'recall')), says('ok'));
    expect(second[0]).toBe('(nothing)');
  });

  it('QA71-H24 a server over HTTP keeps its MCP session for the turn, and a new turn gets a new one', async () => {
    const fixture = await startSessionFixture();
    fixtures.push(fixture);
    const { turn } = await chat({ name: 'remote', description: 'Over HTTP.', url: fixture.url, headers: [] });
    expect(await turn(runs(call('remote', 'remember', { text: 'kept' })), runs(call('remote', 'recall')), says('ok'))).toEqual(['kept', 'kept']);
    expect(await turn(runs(call('remote', 'recall')), says('ok'))).toEqual(['(nothing)']);
  });

  it('QA71-E27 a kept server that dies mid-turn is started again at the next call', async () => {
    const { kernel, fake, sessionId } = await chat(keptEntry(await freePort()));
    const recall = { toolCall: { id: 'recall-after', name: 'run', arguments: { connector: 'mcp', command: 'call', payload: { server: 'kept', tool: 'recall', arguments: {}, risky: false } } } };
    const held = heldReply(recall);
    fake.reply(runs(call('kept', 'remember', { text: 'before' })), runs(call('kept', 'pid')), held.reply, says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await vi.waitFor(() => expect(toolResults(fake)).toHaveLength(2), wait);
    process.kill(Number(toolResults(fake)[1]));
    await vi.waitFor(async () => expect(await running(kernel)).toEqual([]), wait);
    held.release();
    await kernel.clock.advance(0);
    await vi.waitFor(async () => expect((await kernel.exec('kvcoder.session.get', { sessionId })).status).toBe('idle'), wait);
    expect(toolResults(fake).at(-1)).toBe('(nothing)');
  });

  it('QA71-E28 Stop ends the turn and stops its kept servers', async () => {
    const { kernel, fake, sessionId } = await chat(keptEntry(await freePort()));
    const held = heldReply({ text: 'later' });
    fake.reply(runs(call('kept', 'remember', { text: 'x' })), held.reply);
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await vi.waitFor(async () => expect(await running(kernel)).toHaveLength(1), wait);
    await kernel.exec('kvcoder.turn.cancel', { sessionId });
    held.release();
    await vi.waitFor(async () => expect(await running(kernel)).toEqual([]), wait);
  });
});
