import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, vi } from 'vitest';
import type { TestKernel } from '@kvman/testkit';
import type { FakeOpenAI, FakeReply } from '@kvman/testkit/fake-openai';
import { wait } from './wait.ts';

// Chats to rewind (ADR 0118): a message sent and its turn run to its end, the person's messages by seq, and files.

/** Sends `text` with the fake's next replies and runs the turn to its end. */
export async function turnOf(kernel: TestKernel, fake: FakeOpenAI, sessionId: string, text: string, ...replies: FakeReply[]): Promise<void> {
  fake.reply(...replies);
  await kernel.exec('kvcoder.message.send', { sessionId, text });
  await kernel.clock.advance(0);
}

/** Sends `text` and waits until the chat is idle, leaving held helpers and runs going. */
export async function turnWhileRunning(kernel: TestKernel, fake: FakeOpenAI, sessionId: string, text: string, ...replies: FakeReply[]): Promise<void> {
  const requests = fake.requests().length + replies.length;
  fake.reply(...replies);
  await kernel.exec('kvcoder.message.send', { sessionId, text });
  await vi.waitFor(async () => {
    expect(fake.requests().length).toBeGreaterThanOrEqual(requests);
    expect((await kernel.exec('kvcoder.session.get', { sessionId })).status).toBe('idle');
  }, wait);
}

/** The stored messages of a chat, in order. */
export async function stored(kernel: TestKernel, sessionId: string) {
  return (await kernel.exec('kvcoder.message.list', { sessionId, limit: 1000 })).messages;
}

/** The `seq` of the person's message whose text is `text`. */
export async function seqOf(kernel: TestKernel, sessionId: string, text: string): Promise<number> {
  const found = (await stored(kernel, sessionId)).find((message) => message.kind === 'user' && message.content['content'] === text);
  if (found?.seq === undefined) throw new Error(`no message ${text}`);
  return found.seq;
}

/** The texts of the person's messages, in order. */
export async function personTexts(kernel: TestKernel, sessionId: string): Promise<unknown[]> {
  return (await stored(kernel, sessionId)).filter((message) => message.kind === 'user' && message.source?.kind === 'user').map((message) => message.content['content']);
}

export const fileAt = (kernel: TestKernel, name: string): string => path.join(kernel.homeFolder, name);
export const readAt = (kernel: TestKernel, name: string): string | undefined => (existsSync(fileAt(kernel, name)) ? readFileSync(fileAt(kernel, name), 'utf8') : undefined);
export const writeAt = (kernel: TestKernel, name: string, content: string | Buffer): void => writeFileSync(fileAt(kernel, name), content);

type Row = { id: string; data: Record<string, unknown> };

// kvcoder's stored documents in the test kernel's database, only read.
function withDatabase<Value>(kernel: TestKernel, use: (database: DatabaseSync) => Value): Value {
  const database = new DatabaseSync(path.join(kernel.home, 'kvman.db'));
  try {
    return use(database);
  } finally {
    database.close();
  }
}

/** The documents of a kvcoder collection whose `field` is `value`. */
export function storedDocs(kernel: TestKernel, collection: string, field: string, value: string): Row[] {
  return withDatabase(kernel, (database) => database.prepare(`SELECT id, data FROM store_documents WHERE extension = '@kvman/kvcoder' AND collection = ? AND json_extract(data, '$.' || ?) = ?`).all(collection, field, value).map((row) => ({ id: String(row['id']), data: JSON.parse(String(row['data'])) as Record<string, unknown> })));
}
