import { describe, expect, it } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, runs, says, shell, systemPrompt, toolResults, withoutHelperId } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';
import { worker, workers } from './support/workers.ts';

const kvcoder = useKvcoder();
const delegate = command('delegate', 'run', { worker: 'free', title: 'Helper', task: 'Look' });
const settings = workers(worker('free'));

describe('a helper answers the lead only (ADR 0063)', { timeout: 30_000 }, () => {
  it("M2.4-E214 a helper's prompt has no ask, only artifact get, and the shape of its answer", async () => {
    const { kernel, fake } = await kvcoder.start({ settings });
    const sessionId = await newSession(kernel);
    fake.reply(runs(delegate), says('found'), says('done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    const lead = systemPrompt(fake, 0);
    const helper = systemPrompt(fake, 1);
    expect(helper).not.toContain('- ask: ');
    expect(helper).toMatch(/- artifact: [^\n]*\n {2}get +\{ id \(≤50\) \}\n {2}help +\{ command\? \}/);
    expect(helper).toContain('Result: what you did or found. Evidence: ');
    expect(helper).toContain('Files changed: ');
    expect(helper).toContain('Unchecked: ');
    expect(helper).toContain('Questions: what the lead must decide or ask the person');
    expect(helper).not.toContain('in an artifact, not in a reply');
    expect(helper).not.toContain('call `ask`');
    expect(lead).toContain('- ask: ');
    expect(lead).toMatch(/- artifact: [^\n]*\n {2}write +\{/);
    expect(lead).toContain("A worker cannot ask the person or write an artifact");
  });

  it('M2.4-E215 a helper writes and edits no artifact, and reads the lead\'s', async () => {
    const { kernel, fake } = await kvcoder.start({ settings });
    const sessionId = await newSession(kernel);
    fake.reply(
      runs(command('artifact', 'write', { id: 'brief', title: 'Brief', content: '# Brief' })),
      runs(delegate),
      runs(command('artifact', 'write', { id: 'report', title: 'Report', content: '# Found' }), command('artifact', 'edit', { id: 'brief', edits: [{ oldText: 'Brief', newText: 'Changed' }] }), command('artifact', 'get', { id: 'brief' })),
      says('found'),
      says('done'),
    );
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    const [written, edited, read] = toolResults(fake, 3);
    for (const refused of [written, edited]) expect(refused).toMatch(/^error VALIDATION_FAILED: A helper writes no artifact: return it in your answer/);
    expect(read).toContain('"content":"# Brief"');
    expect((await kernel.exec('kvcoder.artifact.list', { sessionId })).map((artifact: { id: string; version: number }) => [artifact.id, artifact.version])).toEqual([['brief', 1]]);
    expect((await turnState(kernel, sessionId)).turn?.pending).toEqual([]);
  });

  it('M2.4-E216 a helper has no ask, and its answer still returns', async () => {
    const { kernel, fake } = await kvcoder.start({ settings });
    const sessionId = await newSession(kernel);
    fake.reply(runs(delegate), runs(command('ask', 'text', { prompt: 'Which one?' })), says('Questions: which one?'), says('done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    expect(toolResults(fake, 2)).toEqual(["error VALIDATION_FAILED: ask isn't available in this subagent."]);
    expect(withoutHelperId(toolResults(fake).at(-1) ?? '')).toBe('Questions: which one?');
    expect((await turnState(kernel, sessionId)).turn?.pending).toEqual([]);
  });

  it("M2.4-E217 a helper's risky line still asks the person", async () => {
    const { kernel, fake } = await kvcoder.start({ settings });
    const sessionId = await newSession(kernel);
    fake.reply(runs(delegate), runs(shell('touch ran.txt', { risky: true })));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    const pending = (await turnState(kernel, sessionId)).turn?.pending ?? [];
    expect(pending.map((item) => item.kind)).toEqual(['subagent']);
    const [asked] = (await turnState(kernel, String(pending[0]?.childSessionId))).turn?.pending ?? [];
    expect(asked?.kind).toBe('approval');
  });
});
