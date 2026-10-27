import { describe, expect, it } from 'vitest';
import { readGuide } from '../src/guide.ts';
import { useKvvideo, videoSession } from './support/kvvideo-kernel.ts';

const kvvideo = useKvvideo();

const lastToolResult = (bodies: readonly unknown[]): unknown => JSON.stringify(bodies.at(-1));

describe('kvvideo in kvcoder (16 §16.1, §16.3)', { timeout: 60_000 }, () => {
  it('M5.1-H1 kvcoder has the optIn video connector and /video, again after a restart', async () => {
    const { kernel } = await kvvideo.start();
    for (let round = 0; round < 2; round += 1) {
      await kernel.clock.advance(0);
      const video = (await kernel.exec('kvcoder.connector.list', {})).find((connector) => connector.name === 'video');
      expect(video).toMatchObject({ owner: '@kvman/kvvideo', kind: 'commands', optIn: true });
      expect(video?.commands?.map(({ name, command, query, examples }) => ({ name, command, query, examples: examples.length }))).toEqual([
        { name: 'check', command: 'kvvideo.setup.get', query: true, examples: 1 },
        { name: 'fonts', command: 'kvvideo.font.list', query: true, examples: 1 },
        { name: 'record', command: 'kvvideo.clip.record', query: false, examples: 1 },
      ]);
      expect((await kernel.exec('kvcoder.slash.list', {})).filter((command) => command.owner === '@kvman/kvvideo')).toEqual([
        { name: 'video', description: 'kvvideo.slash.video', command: 'kvvideo.video.start', message: 'kvvideo.slash.video.message', owner: '@kvman/kvvideo' },
      ]);
      await kernel.restart();
    }
  });

  it('M5.1-H2 /video turns the connector and the guide on in one chat only, with one note', async () => {
    const { kernel } = await kvvideo.start();
    const first = await videoSession(kernel, 'First');
    await kernel.exec('kvvideo.video.start', { sessionId: first, argument: '' });
    const second = (await kernel.exec('kvcoder.session.create', { title: 'Second' })).id;
    const firstPrompt = await kernel.exec('kvcoder.prompt.get', { sessionId: first });
    const secondPrompt = await kernel.exec('kvcoder.prompt.get', { sessionId: second });
    expect(firstPrompt.prompt).toContain('- video: Make videos: record pages of an app running on this computer');
    expect((await kernel.exec('kvcoder.section.list', { sessionId: first })).filter((section) => section.owner === '@kvman/kvvideo').map(({ id, title, order }) => ({ id, title, order }))).toEqual([{ id: 'guide', title: 'Making videos', order: 30 }]);
    expect(firstPrompt.prompt).toContain(readGuide().trim().split('\n')[0]);
    expect(secondPrompt.prompt).not.toContain('- video: ');
    expect(secondPrompt.sections.filter((section) => section.owner === '@kvman/kvvideo')).toEqual([]);
    const { messages } = await kernel.exec('kvcoder.message.list', { sessionId: first, limit: 100 });
    expect(messages.filter((message) => JSON.stringify(message).includes('kvvideo.video.started'))).toHaveLength(1);
  });

  it('M5.1-E8 a chat without /video has no video connector', async () => {
    const { kernel, fake } = await kvvideo.withModel();
    const { id: sessionId } = await kernel.exec('kvcoder.session.create', { title: 'Plain' });
    fake.reply({ chunks: [{ toolCall: { id: 'call-1', name: 'run', arguments: { connector: 'video', command: 'check', payload: {} } } }] }, { chunks: [{ text: 'done' }] });
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'Check video' });
    await kernel.clock.advance(0);
    expect(lastToolResult(fake.requests().map((request) => request.body))).toContain('There is no connector video.');
  });
});
