import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, rawCall, requestMessages, runs, says, toolResults } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';

// A `run` with a `calls` list is stored and run as that many calls (plan 08 §8.2, ADR 0108, 19).

const kvcoder = useKvcoder();
type Wire = { role: string; tool_calls?: { id: string; function: { arguments: string } }[] };

describe('run with a calls list (ADR 0108, 19)', { timeout: 30_000 }, () => {
  it('QA71-H32 three entries run as three calls, each with its own result, and the history shows three calls', async () => {
    const { kernel, fake } = await kvcoder.start();
    writeFileSync(path.join(kernel.homeFolder, 'a.txt'), 'a\n');
    writeFileSync(path.join(kernel.homeFolder, 'b.txt'), 'b\n');
    writeFileSync(path.join(kernel.homeFolder, 'c.txt'), 'old\n');
    const sessionId = await newSession(kernel);
    // Reads run beside a reply's changes (ADR 0046), so the file to edit is read in the reply before.
    fake.reply(runs(command('fs', 'read', { path: 'c.txt' })), rawCall('run', { calls: [
      { connector: 'fs', command: 'read', payload: { path: 'a.txt' } },
      { connector: 'fs', command: 'read', payload: { path: 'b.txt' } },
      { connector: 'fs', command: 'edit', payload: { path: 'c.txt', edits: [{ oldText: 'old', newText: 'new' }], risky: false } },
    ] }), says('done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    const results = toolResults(fake).slice(1);
    expect(results).toHaveLength(3);
    expect(results[0]).toContain('a.txt · line 1 of 1');
    expect(results[1]).toContain('b.txt · line 1 of 1');
    expect(results[2]).toContain('c.txt · 1 replacement');
    const reply = (requestMessages(fake) as Wire[]).filter((message) => message.role === 'assistant' && message.tool_calls !== undefined)[1];
    expect(reply?.tool_calls?.map((call) => call.id.replace(/^.*-(\d)$/, '$1'))).toEqual(['1', '2', '3']);
    expect(JSON.parse(reply?.tool_calls?.[0]?.function.arguments ?? '{}')).toEqual({ connector: 'fs', command: 'read', payload: { path: 'a.txt' } });
  });

  it('QA71-E33 an entry that asks waits, the reads run, and the order holds when the answer comes', async () => {
    const { kernel, fake } = await kvcoder.start();
    writeFileSync(path.join(kernel.homeFolder, 'b.txt'), 'b\n');
    const sessionId = await newSession(kernel);
    fake.reply(rawCall('run', { calls: [
      { connector: 'fs', command: 'write', payload: { path: 'x.txt', content: 'x', risky: true } },
      { connector: 'fs', command: 'read', payload: { path: 'b.txt' } },
    ] }), says('done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    const { session, turn } = await turnState(kernel, sessionId);
    expect(session.status).toBe('waiting');
    expect(turn?.pending.map((item) => item.kind)).toEqual(['approval']);
    await kernel.exec('kvcoder.question.answer', { questionId: String(turn?.pending[0]?.questionId), answer: { confirmed: true } });
    await kernel.clock.advance(0);
    const results = toolResults(fake);
    expect(results[0]).toContain('"path":"x.txt","created":true');
    expect(results[1]).toContain('b.txt · line 1 of 1');
  });
});
