import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { z, type Json } from '@kvman/sdk';
import type { TestKernel } from '@kvman/testkit';
import type { FakeReply } from '@kvman/testkit/fake-openai';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, runs, says } from './support/model-script.ts';
import { newSession } from './support/turns.ts';

// The daily prune deletes an idle chat's artifacts not updated within `kvcoder.artifacts.keepDays` days, and tells the
// chat which (plan 08 §8.1, ADR 0105, 5). Extension code reads the real time, so an old artifact is aged in the database.

const kvcoder = useKvcoder();
const day = 24 * 3_600_000;
const write = (id: string) => command('artifact', 'write', { id, title: id, content: `# ${id}` });
const messageSchema = z.object({ kind: z.string(), source: z.object({ kind: z.string(), name: z.string().optional() }).nullish(), content: z.record(z.string(), z.unknown()) });

// Moves the artifacts `ids` of every chat `days` days back.
function age(kernel: TestKernel, ids: readonly string[], days: number): void {
  const database = new DatabaseSync(path.join(kernel.home, 'kvman.db'));
  try {
    const earlier = new Date(Date.now() - days * day).toISOString();
    const update = database.prepare("UPDATE store_documents SET data = json_set(data, '$.updatedAt', ?) WHERE extension = '@kvman/kvcoder' AND collection = 'artifacts' AND json_extract(data, '$.artifactId') = ?");
    for (const id of ids) update.run(earlier, id);
  } finally {
    database.close();
  }
}

async function chat(settings: Record<string, Json>, ...replies: FakeReply[]) {
  const world = await kvcoder.start({ settings });
  const sessionId = await newSession(world.kernel);
  for (const reply of replies) world.fake.reply(reply);
  await world.kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  await world.kernel.clock.advance(0);
  return { ...world, sessionId };
}

const ids = async (kernel: TestKernel, sessionId: string): Promise<string[]> => (await kernel.exec('kvcoder.artifact.list', { sessionId })).map((artifact) => artifact.id).sort();

async function told(kernel: TestKernel, sessionId: string): Promise<string[]> {
  const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
  return messages.map((message) => messageSchema.parse(message)).filter((message) => message.source?.kind === 'extension' && message.source.name === '@kvman/kvcoder').map((message) => String(message.content['content']));
}

describe('artifacts expire by age (08 §8.1, ADR 0105, 5)', { timeout: 30_000 }, () => {
  it('QA70-H5 an old artifact goes, a fresh one stays, and the chat is told', async () => {
    const { kernel, sessionId } = await chat({ 'kvcoder.artifacts.keepDays': 30 }, runs(write('old'), write('fresh')), says('ok'));
    age(kernel, ['old'], 31);
    await kernel.clock.advance(day);
    expect(await ids(kernel, sessionId)).toEqual(['fresh']);
    expect(await told(kernel, sessionId)).toEqual(['Artifacts not updated in 30 days were deleted: `old`.']);
    expect(await kernel.exec('kvcoder.turn.list', { sessionId, limit: 10 })).toHaveLength(1);
  });

  it('QA70-H6 the setting: 0 by default, in both languages (the Chats card is in ui.test.ts)', async () => {
    const { kernel } = await kvcoder.start();
    expect((await kernel.exec('kernel.settings.list', {})).find((setting) => setting.key === 'kvcoder.artifacts.keepDays')).toMatchObject({ value: 0, source: 'default' });
    for (const language of ['en', 'ar']) {
      const strings = z.record(z.string(), z.string()).parse(JSON.parse(readFileSync(new URL(`../locales/${language}.json`, import.meta.url), 'utf8')));
      expect(strings['kvcoder.artifacts.keepDays.title']).toBeTruthy();
      expect(strings['kvcoder.artifacts.keepDays.description']).toBeTruthy();
    }
  });

  it('QA70-E6 keepDays 0 deletes nothing, however old', async () => {
    const { kernel, sessionId } = await chat({}, runs(write('old')), says('ok'));
    age(kernel, ['old'], 3650);
    await kernel.clock.advance(day);
    expect(await ids(kernel, sessionId)).toEqual(['old']);
    expect(await told(kernel, sessionId)).toEqual([]);
  });

  it("QA70-E7 a chat that isn't idle keeps its old artifacts", async () => {
    const { kernel, sessionId } = await chat({ 'kvcoder.artifacts.keepDays': 30 }, runs(write('old')), runs(command('ask', 'text', { prompt: '?' })));
    expect((await kernel.exec('kvcoder.session.get', { sessionId })).status).toBe('waiting');
    age(kernel, ['old'], 31);
    await kernel.clock.advance(day);
    expect(await ids(kernel, sessionId)).toEqual(['old']);
  });

  it('QA70-E8 the two parts run apart', async () => {
    const { kernel, sessionId } = await chat({ 'kvcoder.sessions.keep': 1 }, runs(write('old')), says('ok'));
    const older = sessionId;
    const newer = await newSession(kernel);
    age(kernel, ['old'], 31);
    await kernel.clock.advance(day);
    expect((await kernel.exec('kvcoder.session.list', { limit: 10 })).map((session) => session.id)).toEqual([newer]);
    await expect(kernel.exec('kvcoder.session.get', { sessionId: older })).rejects.toMatchObject({ problem: { code: 'kvcoder/SESSION_NOT_FOUND' } });

    const kept = await chat({ 'kvcoder.sessions.keep': 1 }, runs(write('old')), says('ok'));
    age(kept.kernel, ['old'], 31);
    await kept.kernel.clock.advance(day);
    expect(await ids(kept.kernel, kept.sessionId)).toEqual(['old']);
  });

  it('QA70-E9 several old ones are named in id order in one message', async () => {
    const { kernel, sessionId } = await chat({ 'kvcoder.artifacts.keepDays': 30 }, runs(write('zeta'), write('alpha')), says('ok'));
    age(kernel, ['zeta', 'alpha'], 40);
    await kernel.clock.advance(day);
    expect(await ids(kernel, sessionId)).toEqual([]);
    expect(await told(kernel, sessionId)).toEqual(['Artifacts not updated in 30 days were deleted: `alpha`, `zeta`.']);
  });
});
