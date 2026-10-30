import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { FakeReply } from '@kvman/testkit/fake-openai';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, fsCall, runs, says, shell, systemPrompt, toolResults } from './support/model-script.ts';
import { newSession } from './support/turns.ts';
import { wait } from './support/wait.ts';
import { brief, worker, workers } from './support/workers.ts';

// What a run may change (plan 08 §8.5, ADR 0108, 2): find and review only read, check runs lines but changes no file
// through fs, and change only the files its brief names; each refusal comes before anyone is asked.

const kvcoder = useKvcoder();

// A helper of `fields` that makes `calls`, one reply each, then answers; gives what its calls returned.
async function helperRan(fields: Record<string, unknown>, calls: readonly FakeReply[], settings: Record<string, unknown> = {}) {
  const { kernel, fake, helperFake } = await kvcoder.start({ settings: settings as never });
  writeFileSync(path.join(kernel.homeFolder, 'a.ts'), 'a\n');
  writeFileSync(path.join(kernel.homeFolder, 'b.ts'), 'b\n');
  const sessionId = await newSession(kernel);
  fake.reply(runs(command('delegate', 'run', brief('general', fields as never))), says('Started.'), says('Read it.'));
  helperFake.reply(...calls, says('done'));
  await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  await kernel.clock.advance(0);
  await vi.waitFor(() => expect(helperFake.requests()).toHaveLength(calls.length + 1), wait);
  return { kernel, fake, helperFake, sessionId, results: toolResults(helperFake) };
}

describe('the scope of a run (ADR 0108, 2)', { timeout: 30_000 }, () => {
  it('QA71-H8 a find run is read-only: a write is refused before any approval, and its prompt has no fs write', async () => {
    const { results, helperFake } = await helperRan({ kind: 'find' }, [runs(fsCall('write', { path: 'a.ts', content: 'x' }))]);
    expect(results[0]).toMatch(/^error VALIDATION_FAILED: .*read-only/);
    expect(systemPrompt(helperFake, 0)).not.toMatch(/\n {2}write +\{ path, content, risky \}/);
  });

  it('QA71-H9 a change run is refused a file outside its files before any approval, and asked about its own', async () => {
    const { kernel, fake, helperFake } = await kvcoder.start({ settings: { 'kvcoder.approval': 'ask' } });
    writeFileSync(path.join(kernel.homeFolder, 'a.ts'), 'a\n');
    writeFileSync(path.join(kernel.homeFolder, 'b.ts'), 'b\n');
    const sessionId = await newSession(kernel);
    fake.reply(runs(command('delegate', 'run', brief('general', { kind: 'change', files: ['a.ts'] }))), says('Started.'));
    helperFake.reply(runs(fsCall('read', { path: 'a.ts' }), fsCall('read', { path: 'b.ts' })), runs(fsCall('edit', { path: 'b.ts', edits: [{ oldText: 'b', newText: 'B' }] })), runs(fsCall('edit', { path: 'a.ts', edits: [{ oldText: 'a', newText: 'A' }] })));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    await vi.waitFor(() => expect(helperFake.requests()).toHaveLength(3), wait);
    expect(toolResults(helperFake, 2)[2]).toBe('error VALIDATION_FAILED: This run may change only: a.ts.');
    const [helper] = (await kernel.exec('kvcoder.job.list', { sessionId })).filter((job) => job.kind === 'subagent');
    await vi.waitFor(async () => expect((await kernel.exec('kvcoder.turn.list', { sessionId: helper?.id ?? 'none', limit: 1 }))[0]?.pending.map((item) => item.kind)).toEqual(['approval']), wait);
  });

  it('QA71-E9 every fs command that changes a file is held to the files', async () => {
    const outside = { path: 'b.ts', risky: false };
    const { results } = await helperRan({ kind: 'change', files: ['a.ts'] }, [runs(fsCall('write', { ...outside, content: 'x' })), runs(command('fs', 'undo', outside)), runs(command('fs', 'part', { path: 'b.ts', part: 1, content: 'x' })), runs(command('fs', 'assemble', outside))]);
    expect(results).toEqual(Array.from({ length: 4 }, () => 'error VALIDATION_FAILED: This run may change only: a.ts.'));
  });

  it('QA71-H8 a check run runs a line, but no fs change, and its prompt has no fs write', async () => {
    const { results, helperFake } = await helperRan({ kind: 'check' }, [runs(shell('echo ran', { risky: false })), runs(fsCall('write', { path: 'a.ts', content: 'x' }))]);
    expect(results[0]).toBe('ran\n[exit code 0]');
    expect(results[1]).toBe('error VALIDATION_FAILED: A check run changes no file: report in your answer what should change and why.');
    expect(systemPrompt(helperFake, 0)).not.toMatch(/\n {2}write +\{ path, content, risky \}/);
  });

  it('QA71-E8 a read-only worker refuses a change run from the check', async () => {
    const { kernel, fake } = await kvcoder.start({ settings: workers(worker('looker', { readOnly: true })) });
    const sessionId = await newSession(kernel);
    fake.reply(runs(command('delegate', 'run', brief('looker', { kind: 'change', files: ['a.ts'] }))), says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    expect(toolResults(fake)).toEqual(['error VALIDATION_FAILED: The worker looker is read-only, so it takes no change run.']);
  });
});
