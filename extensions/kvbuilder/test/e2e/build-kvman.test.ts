import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { startFakeOpenAI, type FakeOpenAI } from '@kvman/testkit/fake-openai';
import { childWait, kvmanWorld, until, useFakeModel, type Kvman, type KvmanWorld } from '../support/kvman-child.ts';
import { says } from '../support/model-script.ts';

let browser: Browser;
let fake: FakeOpenAI;
let world: KvmanWorld;
let kvman: Kvman;
beforeAll(async () => {
  [browser, fake] = await Promise.all([chromium.launch(), startFakeOpenAI()]);
  world = kvmanWorld();
  kvman = await world.start(['--preset', 'coder']);
  await useFakeModel(kvman, fake);
});
afterAll(async () => {
  await world.close();
  await Promise.all([browser.close(), fake.close()]);
});

const messagesSchema = z.object({ messages: z.array(z.object({ kind: z.string(), content: z.record(z.string(), z.unknown()), source: z.object({ kind: z.string() }).optional() })) });
const requestSchema = z.object({ messages: z.array(z.object({ role: z.string(), content: z.unknown().optional() })) });

async function openChat(title: string): Promise<{ page: Page; sessionId: string }> {
  const session = z.object({ id: z.string() }).parse(await kvman.call('commands', 'kvcoder.session.create', { title }));
  const page = await browser.newPage();
  await page.goto(`${kvman.origin}/kvcoder/session/${session.id}?workspace=${kvman.workspaceId}`);
  await page.locator('[data-test="composer-text"]').waitFor({ timeout: childWait.timeout });
  return { page, sessionId: session.id };
}

// What the chat holds once its turn has ended: the note, then the person's message, then the answer.
async function ended(sessionId: string) {
  const done = (found: z.output<typeof messagesSchema>): boolean => found.messages.some((message) => message.kind === 'assistant');
  const { messages } = await until(() => kvman.call('queries', 'kvcoder.message.list', { sessionId, limit: 20 }), messagesSchema, done);
  return messages.map((message) => (message.kind === 'note' ? ['note', message.content['key']] : [message.kind, message.kind === 'user' ? message.content['content'] : undefined, message.source?.kind]));
}

const systemPrompts = (from = 0): string[] => fake.requests().slice(from).map((request) => String(requestSchema.parse(request.body).messages.find((message) => message.role === 'system' || message.role === 'developer')?.content ?? ''));
const systemPrompt = (): string => systemPrompts().at(-1) ?? '';

describe('/build-kvman in the send box (09 §9.4, ADR 0027)', () => {
  it('QA39-H1 /build-kvman is in the list, with what it does', async () => {
    const { page } = await openChat('List');
    await page.locator('[data-test="composer-text"]').fill('/bu');
    await page.locator('[data-test="slash-build-kvman"]').waitFor();
    expect(await page.locator('.kvc-slash-row').count()).toBe(1);
    expect(await page.locator('[data-test="slash-build-kvman"] .kvc-mono').innerText()).toBe('/build-kvman');
    expect(await page.locator('[data-test="slash-build-kvman"] .kvc-muted').innerText()).toBe('Start building kvman in this chat');
    await page.close();
  });

  it('QA39-H2 a bare /build-kvman shows the note, sends the line as the person, and the turn has the guide and the connectors', async () => {
    const { page, sessionId } = await openChat('Bare');
    fake.reply(says('What should the app do?'));
    await page.locator('[data-test="composer-text"]').fill('/build-kvman');
    await page.locator('[data-test="slash-build-kvman"]').waitFor();
    await page.keyboard.press('Enter');
    expect(await ended(sessionId)).toEqual([['note', 'kvbuilder.build.started'], ['user', 'I want to change this app.', 'user'], ['assistant', undefined, undefined]]);
    await page.locator('[data-test="note"]').getByText('Building kvman is on for this chat').waitFor({ timeout: childWait.timeout });
    await page.locator('[data-test="user-message"]').getByText('I want to change this app.').waitFor({ timeout: childWait.timeout });
    const prompt = systemPrompt();
    expect(prompt).toContain('Build an extension, in this order:');
    for (const connector of ['kvman', 'ext', 'preset', 'preview', 'docs']) expect(prompt, connector).toContain(`\n- ${connector}: `);
    await page.close();
  });

  it('QA39-H3 /build-kvman with a request sends the request as the person, not the line', async () => {
    const { page, sessionId } = await openChat('Request');
    fake.reply(says('Starting on the notes page.'));
    await page.locator('[data-test="composer-text"]').fill('/build-kvman add a notes page');
    await page.locator('[data-test="slash-build-kvman"]').waitFor();
    await page.keyboard.press('Enter');
    expect(await ended(sessionId)).toEqual([['note', 'kvbuilder.build.started'], ['user', 'add a notes page', 'user'], ['assistant', undefined, undefined]]);
    await page.locator('[data-test="user-message"]').getByText('add a notes page').waitFor({ timeout: childWait.timeout });
    expect(await page.getByText('I want to change this app.').count()).toBe(0);
    await page.close();
  });

  it('QA40-H1 /build-kvman on the Chat page starts building kvman in a new chat', async () => {
    const requestsBefore = fake.requests().length;
    const page = await browser.newPage();
    await page.goto(`${kvman.origin}/kvcoder/chat?workspace=${kvman.workspaceId}`);
    await page.locator('[data-test="model-picker"]', { hasText: 'M1' }).waitFor({ timeout: childWait.timeout });
    fake.reply(says('What should the app do?'));
    await page.locator('[data-test="composer-text"]').fill('/build-kvman');
    await page.locator('[data-test="slash-build-kvman"]').waitFor();
    await page.keyboard.press('Enter');
    await page.waitForURL(/\/kvcoder\/session\/[^/?]+/, { timeout: childWait.timeout });
    const sessionId = new URL(page.url()).pathname.split('/').at(-1) ?? '';
    expect(await ended(sessionId)).toEqual([['note', 'kvbuilder.build.started'], ['user', 'I want to change this app.', 'user'], ['assistant', undefined, undefined]]);
    await page.locator('[data-test="note"]').getByText('Building kvman is on for this chat').waitFor({ timeout: childWait.timeout });
    await page.locator('[data-test="user-message"]').getByText('I want to change this app.').waitFor({ timeout: childWait.timeout });
    expect(systemPrompts(requestsBefore).filter((prompt) => prompt.includes('Build an extension, in this order:'))).toHaveLength(1);
    await page.close();
  });
});
