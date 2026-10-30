import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, requestMessages, runs, says, textOf, toolResults } from './support/model-script.ts';
import { newSession } from './support/turns.ts';
import { wait } from './support/wait.ts';
import { brief } from './support/workers.ts';

// A run's brief (plan 08 §8.5, ADR 0108, 2): one deliverable, whose first message kvcoder writes from its fields, with
// the text of its context ranges attached up to 20 KB.

const kvcoder = useKvcoder();
const numbered = (count: number): string => Array.from({ length: count }, (_, index) => `line ${String(index + 1)}`).join('\n') + '\n';

async function delegated(fields: Record<string, unknown>, prepare: (folder: string) => void = () => undefined) {
  const { kernel, fake, helperFake } = await kvcoder.start();
  prepare(kernel.homeFolder);
  const sessionId = await newSession(kernel);
  fake.reply(runs(command('delegate', 'run', brief('general', fields as never))), says('Started.'), says('Read it.'));
  helperFake.reply(says('done'));
  await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  await kernel.clock.advance(0);
  return { kernel, fake, helperFake, sessionId };
}

async function firstMessage(fields: Record<string, unknown>, prepare?: (folder: string) => void): Promise<string> {
  const { helperFake } = await delegated(fields, prepare);
  await vi.waitFor(() => expect(helperFake.requests().length).toBeGreaterThan(0), wait);
  return textOf(requestMessages(helperFake, 0).find((message) => message.role === 'user'));
}

describe("a run's brief (ADR 0108, 2)", { timeout: 30_000 }, () => {
  it('QA71-H6 the first message holds the kind, goal, done, the files of a change run, and the context lines numbered', async () => {
    const text = await firstMessage({ kind: 'change', goal: 'Rename the loader.', done: 'The tests pass.', files: ['src/a.ts'], context: [{ path: 'src/a.ts', fromLine: 10, lines: 5 }] }, (folder) => {
      mkdirSync(path.join(folder, 'src'));
      writeFileSync(path.join(folder, 'src', 'a.ts'), numbered(20));
    });
    expect(text).toBe([
      'Kind: change', 'Goal: Rename the loader.', 'Done when: The tests pass.', 'You may change only: src/a.ts', "A shell line isn't limited to these files: change nothing else with it.",
      '', '## Context', '', 'src/a.ts · lines 10–14 of 20 · read on with fromLine 15', '    10\tline 10', '    11\tline 11', '    12\tline 12', '    13\tline 13', '    14\tline 14',
    ].join('\n'));
  });

  it('QA71-H7 ranges past 20 KB are named, not attached', async () => {
    // The first file fills the 20 KB but for less than one of the second's lines.
    const text = await firstMessage({ goal: 'Read them.', context: [{ path: 'big.txt' }, { path: 'wide.txt' }] }, (folder) => {
      writeFileSync(path.join(folder, 'big.txt'), `${'x'.repeat(99)}\n`.repeat(400));
      writeFileSync(path.join(folder, 'wide.txt'), `${'w'.repeat(500)}\n`);
    });
    expect(text).toContain('big.txt · lines 1–');
    expect(text).toContain('wide.txt lines 1–end · not attached (over 20 KB)');
    expect(Buffer.byteLength(text)).toBeLessThan(23 * 1024);
  });

  it('QA71-E7 a context file that is missing is attached as its error, and the run starts', async () => {
    const text = await firstMessage({ goal: 'Read it.', context: [{ path: 'gone.ts' }] });
    expect(text).toContain("gone.ts · error NOT_FOUND: gone.ts doesn't exist.");
  });

  it('QA71-E1, E3, E4, E5, and E6 what the brief refuses fails VALIDATION_FAILED and starts no helper', async () => {
    const refusals: [Record<string, unknown>, RegExp][] = [
      [{ background: true }, /Unrecognized key: "background"/],
      [{ kind: 'review', files: ['a.ts'] }, /files: A review run changes no file, so it takes no files\./],
      [{ kind: 'change' }, /files: A change run names the files it may change\./],
      [{ goal: '' }, /goal: /],
      [{ done: 'd'.repeat(301) }, /done: /],
      [{ kind: 'change', files: ['src/*.ts'] }, /files\.0: Name each file; no wildcards\./],
      [{ kind: 'change', files: Array.from({ length: 51 }, (_, index) => `f${String(index)}.ts`) }, /files: /],
      [{ context: Array.from({ length: 21 }, () => ({ path: 'a.ts' })) }, /context: /],
      [{ budget: 0 }, /budget: /],
      [{ budget: 61 }, /budget: /],
      [{ kind: 'change', files: ['../outside.ts'] }, /outside the workspace folder/],
      [{ context: [{ path: '../outside.ts' }] }, /outside the workspace folder/],
    ];
    for (const [fields, problem] of refusals) {
      const { kernel, fake, sessionId } = await delegated(fields);
      const [result = ''] = toolResults(fake, 1);
      expect(result, JSON.stringify(fields)).toMatch(/^error VALIDATION_FAILED: /);
      expect(result, JSON.stringify(fields)).toMatch(problem);
      expect(await kernel.exec('kvcoder.job.list', { sessionId })).toEqual([]);
    }
  });
});
