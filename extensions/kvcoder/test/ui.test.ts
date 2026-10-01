import { describe, expect, it } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';

const kvcoder = useKvcoder();

describe("kvcoder's UI contributions (08 §8.7, ADR 0009, 104)", { timeout: 30_000 }, () => {
  it('M2.4-E54 the Chat and session pages, the nav item, and the waiting status item', async () => {
    const { kernel } = await kvcoder.start();
    const answer = await kernel.exec('kvcoder.ui.get', {});
    expect(answer).toMatchObject({
      pages: [
        { id: 'chat', title: 'kvcoder.pages.chat', view: { type: 'stack', children: [{ type: 'custom', component: 'kvcoder.sessions' }, { type: 'custom', component: 'kvcoder.conversation', props: {} }] } },
        { id: 'session', params: ['sessionId'], view: { children: [{ component: 'kvcoder.sessions', props: { sessionId: { $param: 'sessionId' } } }, { component: 'kvcoder.conversation', props: { sessionId: { $param: 'sessionId' } } }] } },
      ],
      nav: [{ id: 'chat', page: 'chat', icon: 'message-square' }],
      status: [{ id: 'waiting', query: 'kvcoder.session.count', input: { status: 'waiting' }, text: 'kvcoder.status.waiting', params: { count: { $output: 'count' } } }],
    });
    const info = (await kernel.exec('kernel.extensions.list', {})).find((extension) => extension.name === '@kvman/kvcoder');
    expect(info?.queries.find((query) => query.name === 'kvcoder.session.count')?.public).toBe(true);
    expect(info?.queries.find((query) => query.name === 'kvcoder.ui.get')?.public).toBe(true);
  });
});
