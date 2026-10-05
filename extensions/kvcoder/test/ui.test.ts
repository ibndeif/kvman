import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { useKvcoder } from './support/kvcoder-kernel.ts';

const kvcoder = useKvcoder();

describe("kvcoder's UI contributions (08 §8.7, ADR 0009, 104)", { timeout: 30_000 }, () => {
  it('M2.4-E54 and QA3-H10 the Chat and session pages, the nav item, and the waiting and open-chat status items', async () => {
    const { kernel } = await kvcoder.start();
    const answer = await kernel.exec('kvcoder.ui.get', {});
    expect(answer).toMatchObject({
      pages: [
        { id: 'chat', title: 'kvcoder.pages.chat', view: { type: 'stack', children: [{ type: 'custom', component: 'kvcoder.sessions' }, { type: 'custom', component: 'kvcoder.conversation', props: {} }] } },
        { id: 'session', params: ['sessionId'], view: { children: [{ component: 'kvcoder.sessions', props: { sessionId: { $param: 'sessionId' } } }, { component: 'kvcoder.conversation', props: { sessionId: { $param: 'sessionId' } } }] } },
      ],
      nav: [{ id: 'chat', page: 'chat', icon: 'message-square' }],
      status: [
        { id: 'waiting', query: 'kvcoder.session.count', input: { status: 'waiting' }, text: 'kvcoder.status.waiting', params: { count: { $output: 'count' } } },
        { id: 'chat', query: 'kvcoder.session.get', input: { sessionId: { $param: 'sessionId' } }, text: 'kvcoder.status.chat', params: { input: { $output: 'usage.input', format: 'compact' }, output: { $output: 'usage.output', format: 'compact' }, cost: { $output: 'usage.cost', format: 'usd' } } },
      ],
    });
    const info = (await kernel.exec('kernel.extensions.list', {})).find((extension) => extension.name === '@kvman/kvcoder');
    expect(info?.queries.find((query) => query.name === 'kvcoder.session.count')?.public).toBe(true);
    expect(info?.queries.find((query) => query.name === 'kvcoder.session.get')?.public).toBe(true);
    expect(info?.queries.find((query) => query.name === 'kvcoder.ui.get')?.public).toBe(true);
  });

  it("QA21-H10, QA22-H3, and QA27-H5 the configuration names kvcoder's own settings in four cards, with the model row and the connectors list", async () => {
    const { kernel } = await kvcoder.start();
    const answer = z.object({ configuration: z.object({ children: z.array(z.object({ title: z.string(), children: z.array(z.record(z.string(), z.json())) })) }) }).parse(await kernel.exec('kvcoder.ui.get', {}));
    const cards = answer.configuration.children.map((card) => [card.title, card.children.map((child) => child['key'] ?? child['component'] ?? child['text'])]);
    expect(cards).toEqual([
      ['kvcoder.config.agent', ['kvcoder.model', 'kvcoder.thinking', 'kvcoder.maxSteps', 'kvcoder.compactAt', 'kvcoder.compactKeep']],
      ['kvcoder.config.shell', ['kvcoder.shell.approval', 'kvcoder.shell.path']],
      ['kvcoder.config.chats', ['kvcoder.sessions.keep', 'kvcoder.welcome']],
      ['kvcoder.config.connectors', ['kvcoder.config.connectors.intro', 'kvcoder.connectors']],
    ]);
    expect(answer.configuration.children[0]?.children[0]).toEqual({ type: 'custom', component: 'kvcoder.model', props: {} });
    const own = new Set((await kernel.exec('kernel.extensions.list', {})).find((extension) => extension.name === '@kvman/kvcoder')?.settings.map((setting) => setting.key));
    expect(own.has('kvcoder.connectors.disabled')).toBe(true);
    const keys = answer.configuration.children.flatMap((card) => card.children.flatMap((child) => (child['type'] === 'setting' ? [String(child['key'])] : [])));
    expect(keys.filter((key) => !own.has(key))).toEqual([]);
    expect(keys.filter((key) => key === 'kvcoder.model' || key === 'kvcoder.connectors')).toEqual([]);
  });
});
