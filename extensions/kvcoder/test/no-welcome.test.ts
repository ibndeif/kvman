import { mkdtempSync } from 'node:fs';
import path from 'node:path';
import type { Settings } from '@kvman/sdk';
import { describe, expect, it, vi } from 'vitest';
import { shippedWorkers } from '../src/delegate/workers.ts';
import { heldReply } from './support/held-reply.ts';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { requestMessages, says } from './support/model-script.ts';
import { newSession } from './support/turns.ts';
import { wait } from './support/wait.ts';

const kvcoder = useKvcoder();

describe('a new workspace has no welcome (08 §8.1, ADR 0022, 1)', { timeout: 30_000 }, () => {
  it('QA33-H10 Home and a workspace opened later have no session', async () => {
    const { kernel, root } = await kvcoder.start();
    expect(await kernel.exec('kvcoder.session.list', { limit: 10 })).toEqual([]);
    const opened = await kernel.exec('kernel.workspace.open', { path: mkdtempSync(path.join(root, 'project-')) });
    await kernel.clock.advance(0);
    expect(await kernel.exec('kvcoder.session.list', { limit: 10 }, { workspaceId: opened.id })).toEqual([]);
  });

  it('QA33-E3 the setting is gone: it is not listed, and setting it fails as an unknown key does', async () => {
    const { kernel } = await kvcoder.start();
    expect((await kernel.exec('kernel.settings.list', {})).map((setting) => setting.key)).not.toContain('kvcoder.welcome');
    const unknown = await kernel.exec('kernel.settings.set', { key: 'kvcoder.unknown', value: null, scope: 'global' }).catch((error: unknown) => error);
    const welcome = await kernel.exec('kernel.settings.set', { key: 'kvcoder.welcome', value: null, scope: 'global' }).catch((error: unknown) => error);
    expect(unknown).toMatchObject({ problem: { code: expect.any(String) } });
    expect(welcome).toMatchObject({ problem: { code: (unknown as { problem: { code: string } }).problem.code } });
  });

  it('QA33-H12 the workers setting is one of kvcoder\'s typed settings', async () => {
    const { kernel } = await kvcoder.start();
    const shipped: Settings['kvcoder.delegate.workers'] = shippedWorkers;
    const listed = (await kernel.exec('kernel.settings.list', {})).find((setting) => setting.key === 'kvcoder.delegate.workers');
    expect(listed?.value).toEqual(shipped);
  });

  it('QA33-E6 and M2.4-H8 a note is stored and shown, and neither it nor a notice reaches the model', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    await kernel.exec('kvcoder.note.add', { sessionId, key: 'kvcoder.ui.newChat' });
    const held = heldReply({ text: 'never' });
    fake.reply(held.reply, says('hello'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'first' });
    await vi.waitFor(() => expect(fake.requests()).toHaveLength(1), wait);
    await kernel.exec('kvcoder.turn.cancel', { sessionId });
    held.release();
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'second' });
    await kernel.clock.advance(0);
    const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 10 });
    expect(messages.map((message) => message.kind)).toEqual(['note', 'user', 'notice', 'user', 'assistant']);
    expect(messages[0]).toMatchObject({ kind: 'note', content: { key: 'kvcoder.ui.newChat' } });
    expect(requestMessages(fake).filter((message) => message.role !== 'system' && message.role !== 'developer').map((message) => `${message.role}:${String(message.content)}`)).toEqual(['user:first', 'user:second']);
  });
});
