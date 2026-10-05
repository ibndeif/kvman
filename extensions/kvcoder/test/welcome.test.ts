import { mkdtempSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { heldReply } from './support/held-reply.ts';
import { wait } from './support/wait.ts';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { requestMessages, says } from './support/model-script.ts';

const kvcoder = useKvcoder();

describe('the welcome session (08 §8.1, ADR 0008, 73–75)', { timeout: 30_000 }, () => {
  it('M2.4-H8 and QA9-E1 with kvcoder.welcome set, a new workspace gets the welcome session and its note once, and notes and notices never reach the model', async () => {
    const { kernel, fake, root } = await kvcoder.start({ settings: { 'kvcoder.welcome': 'kvcoder.welcome.default' } });
    const home = await kernel.exec('kvcoder.session.list', { limit: 10 });
    expect(home).toEqual([expect.objectContaining({ title: { key: 'kvcoder.ui.welcomeChat' }, status: 'idle' })]);
    const folder = mkdtempSync(path.join(root, 'project-'));
    const opened = await kernel.exec('kernel.workspace.open', { path: folder });
    await kernel.clock.advance(0);
    const [welcome] = await kernel.exec('kvcoder.session.list', { limit: 10 }, { workspaceId: opened.id });
    const sessionId = String(welcome?.id);
    const options = { workspaceId: opened.id };
    expect((await kernel.exec('kvcoder.message.list', { sessionId, limit: 10 }, options)).messages).toEqual([expect.objectContaining({ kind: 'note', content: { key: 'kvcoder.welcome.default' } })]);
    await kernel.exec('kernel.workspace.close', { workspaceId: opened.id });
    await kernel.exec('kernel.workspace.open', { path: folder });
    await kernel.clock.advance(0);
    expect(await kernel.exec('kvcoder.session.list', { limit: 10 }, options)).toHaveLength(1);

    const held = heldReply({ text: 'never' });
    fake.reply(held.reply, says('hello'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'first' }, options);
    await vi.waitFor(() => expect(fake.requests()).toHaveLength(1), wait);
    await kernel.exec('kvcoder.turn.cancel', { sessionId }, options);
    held.release();
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'second' }, options);
    await kernel.clock.advance(0);
    const kinds = (await kernel.exec('kvcoder.message.list', { sessionId, limit: 10 }, options)).messages.map((message) => message.kind);
    expect(kinds).toEqual(['note', 'user', 'notice', 'user', 'assistant']);
    expect(requestMessages(fake).filter((message) => message.role !== 'system' && message.role !== 'developer').map((message) => `${message.role}:${String(message.content)}`)).toEqual(['user:first', 'user:second']);
  });

  it('M2.4-E52 and QA9-H1 kvcoder.welcome is null by default: Home and a new workspace have no session', async () => {
    const { kernel, root } = await kvcoder.start();
    expect(await kernel.exec('kvcoder.session.list', { limit: 10 })).toEqual([]);
    const opened = await kernel.exec('kernel.workspace.open', { path: mkdtempSync(path.join(root, 'project-')) });
    await kernel.clock.advance(0);
    expect(await kernel.exec('kvcoder.session.list', { limit: 10 }, { workspaceId: opened.id })).toEqual([]);
  });

  it('M2.4-E52 an explicit null creates no welcome session either', async () => {
    const { kernel } = await kvcoder.start({ settings: { 'kvcoder.welcome': null } });
    expect(await kernel.exec('kvcoder.session.list', { limit: 10 })).toEqual([]);
  });
});
