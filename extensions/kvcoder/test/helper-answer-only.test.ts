import { describe, expect, it } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { delegated, helperIds } from './support/helpers.ts';
import { command, runs, says, shell, systemPrompt, toolResults } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';
import { worker, workers } from './support/workers.ts';

const kvcoder = useKvcoder();
const delegate = command('delegate', 'run', { worker: 'free', title: 'Helper', kind: 'check', goal: 'Look', done: 'It is done.' });
const settings = workers(worker('free'));
const lead = [runs(delegate), says('Started.'), says('done')];

describe('a helper answers the lead only (ADR 0063)', { timeout: 30_000 }, () => {
  it("M2.4-E214 a helper's prompt has no ask, only artifact get, and the shape of its answer", async () => {
    const world = await kvcoder.start({ settings });
    const sessionId = await newSession(world.kernel);
    await delegated(world, sessionId, lead, [says('found')]);
    const leadPrompt = systemPrompt(world.fake, 0);
    const helper = systemPrompt(world.helperFake, 0);
    expect(helper).not.toContain('- ask: ');
    expect(helper).toMatch(/- artifact: [^\n]*\n {2}get +\{ id \(≤50\) \}\n {2}help +\{ command\? \}/);
    expect(helper).toContain('Result: what you did or found. Evidence: ');
    expect(helper).toContain('Files changed: ');
    expect(helper).toContain('Unchecked: ');
    expect(helper).toContain('Questions: what the lead must decide or ask the person');
    expect(helper).not.toContain('in an artifact, not in a reply');
    expect(helper).not.toContain('call `ask`');
    expect(leadPrompt).toContain('- ask: ');
    expect(leadPrompt).toMatch(/- artifact: [^\n]*\n {2}write +\{/);
    expect(leadPrompt).toContain('A worker cannot ask the person or write an artifact');
  });

  it("M2.4-E215 a helper writes and edits no artifact, and reads the lead's", async () => {
    const world = await kvcoder.start({ settings });
    const sessionId = await newSession(world.kernel);
    await delegated(world, sessionId, [runs(command('artifact', 'write', { id: 'brief', title: 'Brief', content: '# Brief' })), ...lead], [runs(command('artifact', 'write', { id: 'report', title: 'Report', content: '# Found' }), command('artifact', 'edit', { id: 'brief', edits: [{ oldText: 'Brief', newText: 'Changed' }] }), command('artifact', 'get', { id: 'brief' })), says('found')]);
    const [written, edited, read] = toolResults(world.helperFake, 1);
    for (const refused of [written, edited]) expect(refused).toMatch(/^error VALIDATION_FAILED: A helper writes no artifact: return it in your answer/);
    expect(read).toContain('"content":"# Brief"');
    expect((await world.kernel.exec('kvcoder.artifact.list', { sessionId })).map((artifact: { id: string; version: number }) => [artifact.id, artifact.version])).toEqual([['brief', 1]]);
  });

  it('M2.4-E216 a helper has no ask, and its answer still returns', async () => {
    const world = await kvcoder.start({ settings });
    const sessionId = await newSession(world.kernel);
    await delegated(world, sessionId, lead, [runs(command('ask', 'text', { prompt: 'Which one?' })), says('Questions: which one?')]);
    expect(toolResults(world.helperFake, 1)).toEqual(["error VALIDATION_FAILED: ask isn't available in this subagent."]);
    expect(JSON.stringify(world.fake.requests().at(-1)?.body)).toContain('finished:\\nQuestions: which one?');
  });

  it("M2.4-E217 a helper's risky line still asks the person", async () => {
    const world = await kvcoder.start({ settings });
    const sessionId = await newSession(world.kernel);
    await delegated(world, sessionId, lead, [runs(shell('touch ran.txt', { risky: true }))]);
    const [childId = ''] = await helperIds(world.kernel, sessionId);
    const [asked] = (await turnState(world.kernel, childId)).turn?.pending ?? [];
    expect(asked?.kind).toBe('approval');
  });
});
