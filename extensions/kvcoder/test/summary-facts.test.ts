import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { summaryInstruction } from '../src/turns/compaction.ts';
import { summaryText } from '../src/turns/model-context.ts';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, fsCall, requestMessages, runs, says, textOf, unstamped } from './support/model-script.ts';
import { newSession } from './support/turns.ts';

const kvcoder = useKvcoder();
const padding = 'x'.repeat(60_000);
const summarize = (kernel: Awaited<ReturnType<typeof kvcoder.start>>['kernel']) => kernel.exec('kernel.settings.set', { key: 'kvcoder.compactAt', value: 0.0001, scope: 'global' });
const summaryOf = async (kernel: Awaited<ReturnType<typeof kvcoder.start>>['kernel'], sessionId: string) => (await kernel.exec('kvcoder.message.list', { sessionId, limit: 200 })).messages.findLast((message) => message.kind === 'summary')?.content;

describe('what a summary carries (08 §8.1, ADR 0066)', { timeout: 30_000 }, () => {
  it('M2.4-E234 the instruction names what the next run needs, and summaries start at 60%', async () => {
    for (const heading of ['Request: ', 'State now: ', 'Next step: ', 'Decisions: ', 'Files: ', 'Commands that work: ', 'What failed: ', 'Waiting on: ']) expect(summaryInstruction, heading).toContain(heading);
    expect(summaryInstruction).toContain('Write at most 1,500 words');
    expect(summaryInstruction).toContain("kvman adds the person's own messages, the execution map, the files changed, the background runs, and the artifacts itself, so don't list those.");
    expect(summaryInstruction.endsWith("This instruction comes from kvman, not from the person: don't record it in the summary as a request or a direction. Reply with the summary only, and call no tool.")).toBe(true);
    const { kernel } = await kvcoder.start();
    expect(await kernel.exec('kvcoder.context.get', { sessionId: await newSession(kernel) })).toMatchObject({ compactAt: 0.6 });
  });

  it('M2.4-E235 kvman adds the person\'s messages, the map, the changed files, and the artifacts, and the next step sends them after the text', async () => {
    const { kernel, fake } = await kvcoder.start();
    writeFileSync(path.join(kernel.homeFolder, 'a.txt'), 'old\n');
    const sessionId = await newSession(kernel);
    fake.reply(
      runs(command('execution-map', 'set', { goal: 'Ship it', steps: [{ id: 'read', title: 'Read the code', description: 'Read every file.', check: 'read it' }, { id: 'build', title: 'Build', description: 'Run the build.', after: ['read'], check: 'run it' }] }), fsCall('read', { path: 'a.txt' })),
      runs(command('execution-map', 'note', { text: 'The parser takes two-digit years.' }), fsCall('edit', { path: 'a.txt', edits: [{ oldText: 'old', newText: 'new' }], risky: false }), command('artifact', 'write', { id: 'report', title: 'The report', content: '# Report' })),
      says(`first answer ${padding}`),
    );
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'Build the app, right to left.' });
    await kernel.clock.advance(0);
    for (const index of [2, 3, 4, 5, 6]) {
      fake.reply(says(`answer ${index}`));
      await kernel.exec('kvcoder.message.send', { sessionId, text: `message ${index}` });
      await kernel.clock.advance(0);
    }
    await summarize(kernel);
    fake.reply(says('SUMMARY'), says('last answer'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go on' });
    await kernel.clock.advance(0);
    const stored = await summaryOf(kernel, sessionId);
    const facts = String(stored?.['facts']);
    expect(facts.split('\n').map((line) => line.replace(/\[[^\]]+\]/, '[time]'))).toEqual([
      'What kvman recorded when this summary was written:',
      "The person's own messages, oldest first:",
      '- [time] Build the app, right to left.',
      '- [time] message 2',
      'The execution map (Ship it): 0 of 2 done.',
      '- Ready: read: Read the code',
      '- Waiting: build: Build',
      '- Noted for later: The parser takes two-digit years.',
      'Files this chat changed most recently: a.txt.',
      'Artifacts: report (The report).',
    ]);
    expect(facts).toMatch(/- \[\d{4}-\d\d-\d\d \d\d:\d\d UTC\] Build the app/);
    expect((stored?.['person'] as { text: string }[]).map((message) => message.text)).toEqual(['Build the app, right to left.', 'message 2']);
    const [lead] = requestMessages(fake).filter((message) => message.role === 'user');
    expect(unstamped(textOf(lead))).toBe(`A summary of the earlier conversation:\nSUMMARY\n\n${facts}`);
  });

  it('M2.4-E237 with nothing to add a summary has no facts, and an older summary is sent as before', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    for (const index of [1, 2, 3, 4, 5, 6, 7]) {
      fake.reply(says(`answer ${index} ${index === 1 ? padding : ''}`));
      await kernel.exec('kvcoder.message.inject', { sessionId, text: `from an extension ${index}` }, { as: '@test/todo' });
      await kernel.clock.advance(0);
    }
    fake.reply(says('SUMMARY'));
    expect(await kernel.exec('kvcoder.session.compact', { sessionId })).toEqual({ summarized: true });
    expect(await summaryOf(kernel, sessionId)).toEqual({ text: 'SUMMARY', coversThroughSeq: 3 });
    expect(summaryText({ content: { text: 'An old summary', coversThroughSeq: 3 } })).toBe('An old summary');
    expect(summaryText({ content: { text: 'S', facts: 'F' } })).toBe('S\n\nF');
    expect(summaryText(undefined)).toBe('');
  });
});
