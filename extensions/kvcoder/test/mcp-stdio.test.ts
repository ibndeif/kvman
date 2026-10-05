import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { z } from '@kvman/sdk';
import { alive } from './support/alive.ts';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { commandEntry, setServers, type CommandEntry } from './support/mcp-servers.ts';
import { command, runs, says, toolResults, type RunCallSpec } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';
import { wait } from './support/wait.ts';

const kvcoder = useKvcoder();

const call = (tool: string, input: Record<string, unknown> = {}, more: Record<string, unknown> = {}): RunCallSpec => command('mcp', 'call', { server: 'demo', tool, arguments: input, risky: false, ...more });

async function run(entry: (folder: string) => CommandEntry, commands: readonly RunCallSpec[]) {
  const { kernel, fake } = await kvcoder.start();
  await setServers(kernel, [entry(kernel.homeFolder)]);
  const sessionId = await newSession(kernel);
  fake.reply(runs(...commands), says('ok'));
  await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  await kernel.clock.advance(0);
  return { results: toolResults(fake), kernel };
}

const pidsSchema = z.object({ server: z.number(), child: z.number() });

describe('an MCP server run as a command (08 §8.5, ADR 0020, 4 and 17)', { timeout: 60_000 }, () => {
  it('QA29-E10 a command that cannot start fails kvcoder/MCP_CONNECT_FAILED with the reason', async () => {
    const { results, kernel } = await run(() => ({ ...commandEntry(), command: 'no-such-program-kvman', args: [] }), [call('echo', { text: 'x' })]);
    expect(results[0]).toMatch(/^error kvcoder\/MCP_CONNECT_FAILED: The MCP server demo failed: .*no-such-program-kvman/);
    expect(await kernel.exec('kvcoder.mcp.server.check', { name: 'demo' })).toMatchObject({ status: 'failed', problem: { code: 'kvcoder/MCP_CONNECT_FAILED', params: { server: 'demo' } } });
  });

  it('QA29-E11 a command that is not an MCP server fails with what it printed', async () => {
    const entry = (folder: string): CommandEntry => {
      const script = path.join(folder, 'not-mcp.mjs');
      writeFileSync(script, "console.error('I am not an MCP server.');\nprocess.exit(2);\n");
      return { ...commandEntry(), args: [script] };
    };
    const { results } = await run(entry, [call('echo', { text: 'x' })]);
    expect(results[0]).toMatch(/^error kvcoder\/MCP_CONNECT_FAILED: /);
    expect(results[0]?.endsWith('I am not an MCP server.')).toBe(true);
  });

  it('QA29-E12 the process tree is killed when the call ends: the server and the child it started', async () => {
    const { results } = await run(() => commandEntry(), [call('spawn')]);
    const pids = pidsSchema.parse(JSON.parse(String(results[0])));
    await vi.waitFor(() => expect([alive(pids.server), alive(pids.child)]).toEqual([false, false]), wait);
  });

  it('QA29-E13 a call that passes its timeout fails saying so, and its server is gone', async () => {
    const { results } = await run(() => commandEntry(), [call('spawn'), call('sleep', { ms: 60_000 }, { timeoutMs: 300 })]);
    expect(results[1]).toBe("error kvcoder/MCP_CONNECT_FAILED: The MCP server demo failed: it didn't answer within 1 s");
    const pids = pidsSchema.parse(JSON.parse(String(results[0])));
    await vi.waitFor(() => expect(alive(pids.server)).toBe(false), wait);
  });

  it('QA29-E14 cancelling the turn ends a running call and its server', async () => {
    const { kernel, fake } = await kvcoder.start();
    const pidFile = path.join(kernel.homeFolder, 'pid.txt');
    const script = path.join(kernel.homeFolder, 'slow.mjs');
    writeFileSync(script, `import { existsSync, readFileSync, writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(pidFile)}, String(process.pid));\nsetInterval(() => {}, 1000);\n`);
    await setServers(kernel, [{ ...commandEntry(), args: [script] }]);
    const sessionId = await newSession(kernel);
    fake.reply(runs(call('echo', { text: 'x' })), says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    const pid = await vi.waitFor(() => {
      expect(existsSync(pidFile)).toBe(true);
      return Number(readFileSync(pidFile, 'utf8'));
    }, wait);
    expect(alive(pid)).toBe(true);
    await kernel.exec('kvcoder.turn.cancel', { sessionId });
    await vi.waitFor(() => expect(alive(pid)).toBe(false), wait);
    expect((await turnState(kernel, sessionId)).turn).toMatchObject({ outcome: 'cancelled' });
  });
});
