import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { FakeReply } from '@kvman/testkit/fake-openai';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { longAlone, padded } from './support/long-messages.ts';
import { command, fsCall, runs, says, systemPrompt, toolResults } from './support/model-script.ts';
import { newSession } from './support/turns.ts';
import { wait } from './support/wait.ts';

const kvcoder = useKvcoder();

const unchanged = 'notes.txt is unchanged since you read these lines earlier in this conversation; that result is above.';
const whole = (content: string, totalLines: number, fromLine = 1): string => JSON.stringify({ path: 'notes.txt', fromLine, totalLines, content });
const briefing = 'A worker sees none of this conversation and reads again every file it needs, so delegate only what is worth that, and put the paths, the lines that matter, and what you already found in the brief.';

// A chat in a workspace with `notes.txt`, whose model answers one message with `replies`, a step each.
async function chat(replies: readonly FakeReply[], text = 'go') {
  const { kernel, fake } = await kvcoder.start();
  writeFileSync(path.join(kernel.homeFolder, 'notes.txt'), 'one\ntwo\n');
  const sessionId = await newSession(kernel);
  fake.reply(...replies);
  await kernel.exec('kvcoder.message.send', { sessionId, text });
  await kernel.clock.advance(0);
  return { kernel, fake, sessionId };
}

const read = (payload: Record<string, unknown> = {}) => runs(fsCall('read', { path: 'notes.txt', ...payload }));

describe('fs read says when nothing changed (08 §8.5, ADR 0034, 2 and 3)', { timeout: 30_000 }, () => {
  it('QA46-H2 a second read of the same lines of an unchanged file points at the first', async () => {
    const { fake } = await chat([read(), read(), says('ok')]);
    expect(toolResults(fake)).toEqual([whole('one\ntwo\n', 2), unchanged]);
  });

  it('QA46-H3 the lead is told what a worker costs, and a subagent is not', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(runs(command('delegate', 'run', { worker: 'general', task: 'Check it' })), says('child done'), says('parent done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await vi.waitFor(() => expect(fake.requests()).toHaveLength(3), wait);
    expect(systemPrompt(fake, 0)).toContain(`what to return. ${briefing} Read what a worker returns`);
    expect(systemPrompt(fake, 1)).not.toContain(briefing);
  });

  it('QA46-E1 a changed file, and other lines of an unchanged one, are read in full', async () => {
    const edit = runs(fsCall('edit', { path: 'notes.txt', edits: [{ oldText: 'two', newText: '2' }] }));
    const { fake } = await chat([read(), edit, read(), read({ fromLine: 2 }), read(), says('ok')]);
    const results = toolResults(fake);
    expect(results[2]).toBe(whole('one\n2\n', 2));
    expect(results[3]).toBe(whole('2\n', 2, 2));
    expect(results[4]).toBe(unchanged);
  });

  it('QA46-E2 after a summary covered the read, the file is read in full again', async () => {
    const { kernel, fake, sessionId } = await chat([read(), says('done')], padded('go', longAlone));
    await kernel.exec('kernel.settings.set', { key: 'kvcoder.compactKeep', value: 1, scope: 'global' });
    fake.reply(says('SUMMARY'));
    expect(await kernel.exec('kvcoder.session.compact', { sessionId })).toEqual({ summarized: true });
    fake.reply(read(), says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'again' });
    await kernel.clock.advance(0);
    expect(toolResults(fake)).toEqual([whole('one\ntwo\n', 2)]);
  });
});
