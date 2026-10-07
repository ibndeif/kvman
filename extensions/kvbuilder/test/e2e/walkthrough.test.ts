import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from '@kvman/sdk';
import { startFakeOpenAI, type FakeOpenAI } from '@kvman/testkit/fake-openai';
import { callKvman, childWait, kvmanWorld, until, useFakeModel, type Kvman, type KvmanWorld } from '../support/kvman-child.ts';
import { runs, says, shell, toolResults } from '../support/model-script.ts';
import { npmEnvironment } from '../support/npm-environment.ts';

let browser: Browser;
let fake: FakeOpenAI;
let world: KvmanWorld;
beforeAll(async () => {
  [browser, fake] = await Promise.all([chromium.launch(), startFakeOpenAI()]);
  world = kvmanWorld();
});
afterAll(async () => {
  await world.close();
  await Promise.all([browser.close(), fake.close()]);
});

const turnsSchema = z.array(z.object({ outcome: z.string().optional(), pending: z.array(z.object({ kind: z.string(), questionId: z.string().optional() })).optional() }));

// Approves each shell call the agent asks about, until the turn ends.
async function approveUntilDone(kvman: Kvman, sessionId: string): Promise<void> {
  await vi.waitFor(async () => {
    const [turn] = turnsSchema.parse(await kvman.call('queries', 'kvcoder.turn.list', { sessionId, limit: 1 }));
    const approval = turn?.pending?.find((pending) => pending.kind === 'approval');
    if (approval?.questionId !== undefined) await kvman.call('commands', 'kvcoder.question.answer', { questionId: approval.questionId, answer: { confirmed: true } });
    if (turn?.outcome === undefined) throw new Error('the turn is still going');
    expect(turn.outcome).toBe('done');
  }, { timeout: 240_000, interval: 250 });
}

describe('the walkthrough (09, 13 M2.5)', () => {
  it('M2.5-H1 and QA34-H13 in the coder preset the agent scaffolds, tests, lists, checks, previews, and calls an extension, and an edit hot-reloads', async () => {
    const kvman = await world.start(['--preset', 'coder'], npmEnvironment());
    await useFakeModel(kvman, fake);
    fake.reply(
      runs('ext', 'new', { name: 'notes', namespace: 'notes', folder: 'notes' }),
      runs('ext', 'test', { folder: 'notes' }),
      runs('ext', 'list'),
      shell("cp notes/src/index.ts notes/index.backup && sed -i \"/description: 'Gives the greeting.',/d\" notes/src/index.ts"),
      runs('ext', 'check', { folder: 'notes' }),
      shell('mv notes/index.backup notes/src/index.ts'),
      runs('preview', 'start', { extensions: ['notes'] }),
      runs('preview', 'query-get', { name: 'notes.greeting.get' }),
      says('The notes extension is ready.'),
    );
    const session = z.object({ id: z.string() }).parse(await kvman.call('commands', 'kvcoder.session.create', { title: 'Walkthrough' }));
    await kvman.call('commands', 'kvbuilder.build.start', { sessionId: session.id, argument: '' });
    await kvman.call('commands', 'kvcoder.message.send', { sessionId: session.id, text: 'Build a notes extension' });
    await approveUntilDone(kvman, session.id);
    const [created, tested, listed, planted, checked, restored, previewed, called] = toolResults(fake);
    expect(JSON.parse(created ?? '')).toEqual({ folder: 'notes', name: 'notes', namespace: 'notes', web: false });
    expect(tested).toMatch(/"passed":true/);
    expect(listed).toContain('"folder":"notes"');
    expect(planted).toMatch(/\[exit code 0\]$/);
    expect(checked).toMatch(/doesn't load: .*notes\.greeting\.get.*description/s);
    expect(restored).toMatch(/\[exit code 0\]$/);
    const url = z.object({ url: z.string() }).parse(JSON.parse(previewed ?? '')).url;
    expect(Number(new URL(url).port)).toBeGreaterThanOrEqual(3738);
    expect(JSON.parse(called ?? '')).toEqual({ ok: true, output: { text: 'Hello from notes!' } });

    const page = await browser.newPage();
    await page.goto(`${url}notes/hello`);
    await page.getByText('Hello from notes!').waitFor({ timeout: childWait.timeout });
    const source = path.join(world.project, 'notes', 'src', 'index.ts');
    writeFileSync(source, readFileSync(source, 'utf8').replace('Hello from notes!', 'Hello again from notes!'));
    const greeting = z.object({ text: z.string() });
    await until(() => callKvman(new URL(url).origin, 'queries', 'notes.greeting.get', {}), greeting, (answer) => answer.text === 'Hello again from notes!');
    await page.reload();
    await page.getByText('Hello again from notes!').waitFor({ timeout: childWait.timeout });
    expect(existsSync(path.join(world.project, 'notes', 'dist'))).toBe(false);
  });
});
