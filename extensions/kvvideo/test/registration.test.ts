import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { brandSchema } from '../src/brand/brand.ts';
import { composeInputSchema } from '../src/compose/compose-input.ts';
import { readGuide } from '../src/guide.ts';
import { lookInputSchema } from '../src/look/look-input.ts';
import { narrateInputSchema } from '../src/narration/register-narration.ts';
import { voiceInputSchema } from '../src/narration/register-voice.ts';
import { recordInputSchema } from '../src/record/steps.ts';
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
        { name: 'brand', command: 'kvvideo.brand.get', query: true, examples: 1 },
        { name: 'brand-set', command: 'kvvideo.brand.set', query: false, examples: 1 },
        { name: 'record', command: 'kvvideo.clip.record', query: false, examples: 1 },
        { name: 'look', command: 'kvvideo.frame.capture', query: false, examples: 1 },
        { name: 'narrate', command: 'kvvideo.narration.make', query: false, examples: 1 },
        { name: 'voice', command: 'kvvideo.voice.make', query: false, examples: 1 },
        { name: 'compose', command: 'kvvideo.video.compose', query: false, examples: 1 },
        { name: 'review', command: 'kvvideo.video.review', query: false, examples: 1 },
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
    expect(firstPrompt.prompt).toContain('- video: Make any kind of video: record websites and HTML pages you write');
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

  // Superseded by M5.12-H1: the guide is ten stages, then the production rules, then the rules (ADR 0117, 8).
  it("M5.11-H1 M5.12-H1 after /video the prompt holds the guide's ten stages, then the production rules, then the rules", async () => {
    const { kernel } = await kvvideo.start();
    const sessionId = await videoSession(kernel);
    const { prompt } = await kernel.exec('kvcoder.prompt.get', { sessionId });
    const stages = ['Ready', 'Brief', 'Research', 'Concept', 'Treatment', 'Production map', 'Voice first', 'Pictures', 'Assemble and review', 'Deliver'].map((stage, index) => `${String(index + 1)}. **${stage}.**`);
    const groups = [...stages, '**Story.**', '**Look.**', '**Motion.**', '**Text.**', '**Sound.**', '**Accuracy and licences.**', 'Rules:'];
    const at = groups.map((group) => prompt.indexOf(group));
    expect(at.every((index, position) => index > 0 && (position === 0 || index > (at[position - 1] ?? 0))), JSON.stringify(at)).toBe(true);
    for (const said of ['There is no music.', 'Never generate images.', '`video check`', '`brief.md`', '`style.css`', '`video look`', 'the worker that debates approaches', '`ask choice`', 'about 2.5 words a second in English and 2 in Arabic', '`animation-delay` of 300 ms', 'motion graphics designer', 'at most three rounds', '`ask record`', '`voice`', '`compose`', '`video review`', '`extraSizes`']) expect(prompt).toContain(said);
    expect(readGuide()).not.toContain('.srt');
  });

  it('M5.12-H2 the connector has look after record, a command whose images reach the model, with an example', async () => {
    const { kernel } = await kvvideo.start();
    const video = (await kernel.exec('kvcoder.connector.list', {})).find((connector) => connector.name === 'video');
    const names = video?.commands?.map((command) => command.name) ?? [];
    expect(names.indexOf('look')).toBe(names.indexOf('record') + 1);
    const look = video?.commands?.find((command) => command.name === 'look');
    expect(look).toMatchObject({ command: 'kvvideo.frame.capture', query: false, images: true });
    expect(lookInputSchema.safeParse(look?.examples[0]?.input).success).toBe(true);
  });

  it('M5.12-H9 nothing of kvvideo is in a chat before /video, and all of it after', async () => {
    const { kernel } = await kvvideo.start();
    const { id: plain } = await kernel.exec('kvcoder.session.create', { title: 'Plain' });
    const video = await videoSession(kernel);
    const workflow = ['Making videos', '- video: ', '`brief.md`', '`style.css`', '`video look`', 'motion graphics designer'];
    const plainPrompt = (await kernel.exec('kvcoder.prompt.get', { sessionId: plain })).prompt;
    const videoPrompt = (await kernel.exec('kvcoder.prompt.get', { sessionId: video })).prompt;
    for (const said of workflow) {
      expect(plainPrompt, said).not.toContain(said);
      expect(videoPrompt, said).toContain(said);
    }
  });

  it("M5.11-H2 the connector's description, and each command with one example its command takes", async () => {
    const { kernel } = await kvvideo.start();
    const video = (await kernel.exec('kvcoder.connector.list', {})).find((connector) => connector.name === 'video');
    expect(video?.description).toBe("Make any kind of video: record websites and HTML pages you write, use the person's images and clips and licensed ones from the web, narrate a script or have the person record it, and compose them with camera moves, transitions, captions, and sound into an MP4. Use it when the person asks for a video of any kind.");
    const schemas: Record<string, { safeParse(value: unknown): { success: boolean } }> = { check: z.strictObject({}), fonts: z.strictObject({}), brand: z.strictObject({}), 'brand-set': brandSchema, record: recordInputSchema, look: lookInputSchema, narrate: narrateInputSchema, voice: voiceInputSchema, compose: composeInputSchema, review: z.strictObject({ file: z.string() }) };
    expect(video?.commands?.map((command) => command.name)).toEqual(Object.keys(schemas));
    for (const command of video?.commands ?? []) {
      expect(command.examples, command.name).toHaveLength(1);
      expect(schemas[command.name]?.safeParse(command.examples[0]?.input).success, command.name).toBe(true);
    }
  });
});
