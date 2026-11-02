import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ProblemError, type Json } from '@kvman/sdk';
import { useFakePrograms } from './support/fake-programs.ts';
import { useKvvideo } from './support/kvvideo-kernel.ts';

const kvvideo = useKvvideo();
const programs = useFakePrograms();

// Piper writes `WAV:<sentence>` at its -f and adds its arguments as a line to its log; it fails on a sentence holding
// `FAIL`. ffmpeg joins its inputs as `JOINED<json of their contents>`. ffprobe gives a sentence one second per word,
// and a joined file the sum with 250 ms between sentences.
const logsArgs = "fs.appendFileSync(__filename + '.log', JSON.stringify(args) + '\\n');";
const piperWrites = `${logsArgs} const sentence = args[args.length - 1]; if (sentence.includes('FAIL')) { console.error('voice broke'); process.exit(1); } fs.writeFileSync(args[args.indexOf('-f') + 1], 'WAV:' + sentence);`;
const ffmpegJoins = `${logsArgs} const inputs = args.filter((_, index) => args[index - 1] === '-i'); fs.writeFileSync(args[args.length - 1], 'JOINED' + JSON.stringify(inputs.map((input) => fs.readFileSync(input, 'utf8'))));`;
const ffprobeMeasures = [
  "const words = (text) => text.slice(text.indexOf(':') + 1).trim().split(/\\s+/).length;",
  'const content = fs.readFileSync(args[args.length - 1], "utf8");',
  "if (!content.startsWith('JOINED')) { console.log(String(words(content))); process.exit(0); }",
  'const parts = JSON.parse(content.slice(6));',
  'console.log(String(parts.reduce((sum, part) => sum + words(part), 0) + 0.25 * (parts.length - 1)));',
].join('\n');

function piperWorld(overrides: Record<string, Json> = {}) {
  const piper = programs.program('piper', piperWrites);
  const ffmpeg = programs.program('ffmpeg', ffmpegJoins);
  const ffprobe = programs.program('ffprobe', ffprobeMeasures);
  const settings = { 'kvvideo.narration.service': 'piper', 'kvvideo.narration.voice': '/voices/en.onnx', 'kvvideo.programs.piper': piper, 'kvvideo.programs.ffmpeg': ffmpeg, 'kvvideo.programs.ffprobe': ffprobe, ...overrides };
  return { piper, ffmpeg, ffprobe, settings };
}

const runs = (program: string): string[][] => (existsSync(`${program}.log`) ? readFileSync(`${program}.log`, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as string[]) : []);
const problemOf = (run: Promise<unknown>): Promise<unknown> =>
  run.then(
    () => undefined,
    (error: unknown) => (error instanceof ProblemError ? error.problem : error),
  );

const text = 'Open the app. Sign in now. Write a note.';

describe('video narrate, sentence by sentence (16 §16.6, ADR 0115)', { timeout: 60_000 }, () => {
  it('M5.6-H1 M5.6-H13 each sentence is said, then joined with 250 ms between them, with its captions and sidecar', async () => {
    const { piper, ffmpeg, settings } = piperWorld();
    const { kernel, workspace } = await kvvideo.start({ settings });
    const chunks: unknown[] = [];
    const answer = await kernel.exec('kvvideo.narration.make', { text, file: 'videos/n/01.mp3' }, { onProgress: (chunk) => chunks.push(chunk) });
    expect(runs(piper).map((args) => args.at(-1))).toEqual(['Open the app.', 'Sign in now.', 'Write a note.']);
    expect(runs(piper)[0]?.slice(0, 2)).toEqual(['-m', '/voices/en.onnx']);
    expect(runs(ffmpeg)[0]?.filter((arg) => arg.endsWith('.wav'))).toHaveLength(3);
    expect(answer).toEqual({
      file: 'videos/n/01.mp3',
      durationMs: 9500,
      reused: 0,
      captions: [
        { text: 'Open the app.', startMs: 0, endMs: 3250 },
        { text: 'Sign in now.', startMs: 3250, endMs: 6500 },
        { text: 'Write a note.', startMs: 6500, endMs: 9500 },
      ],
    });
    expect(readFileSync(`${workspace}/videos/n/01.mp3`, 'utf8')).toBe(`JOINED${JSON.stringify(['WAV:Open the app.', 'WAV:Sign in now.', 'WAV:Write a note.'])}`);
    expect(JSON.parse(readFileSync(`${workspace}/videos/n/01.mp3.kvvideo.json`, 'utf8'))).toEqual({ kind: 'narration', durationMs: 9500, captions: answer.captions });
    expect(chunks).toEqual([1, 2, 3].map((n) => ({ source: '@kvman/kvvideo', data: { key: 'kvvideo.progress.sentence', params: { n, of: 3 } } })));
  });

  it("M5.6-H6 Piper's speed is its length scale", async () => {
    const { piper, settings } = piperWorld();
    const { kernel } = await kvvideo.start({ settings });
    await kernel.exec('kvvideo.narration.make', { text: 'Hi.', file: 'a.mp3', speed: 0.8 });
    const args = runs(piper)[0] ?? [];
    expect(args[args.indexOf('--length-scale') + 1]).toBe('1.25');
  });

  it('M5.6-H10 the same text again is free, and a changed sentence alone is said again', async () => {
    const { piper, settings } = piperWorld();
    const { kernel } = await kvvideo.start({ settings });
    const first = await kernel.exec('kvvideo.narration.make', { text, file: 'a.mp3' });
    const again = await kernel.exec('kvvideo.narration.make', { text, file: 'b.mp3' });
    expect(runs(piper)).toHaveLength(3);
    expect(again).toEqual({ ...first, file: 'b.mp3', reused: 3 });
    const changed = await kernel.exec('kvvideo.narration.make', { text: 'Open the app. Sign in today please. Write a note.', file: 'c.mp3' });
    expect(runs(piper).map((args) => args.at(-1))).toEqual(['Open the app.', 'Sign in now.', 'Write a note.', 'Sign in today please.']);
    expect(changed.reused).toBe(2);
    expect(changed.durationMs).toBe(10_500);
  });

  it('M5.6-E1 a failing sentence fails the call and writes nothing; the sentences before it stay cached', async () => {
    const { piper, settings } = piperWorld();
    const { kernel, workspace } = await kvvideo.start({ settings });
    expect(await problemOf(kernel.exec('kvvideo.narration.make', { text: 'Open the app. FAIL here.', file: 'a.mp3' }))).toMatchObject({ code: 'kvvideo/NARRATION_FAILED', params: { service: 'piper', reason: 'voice broke' } });
    expect([existsSync(`${workspace}/a.mp3`), existsSync(`${workspace}/a.mp3.kvvideo.json`)]).toEqual([false, false]);
    expect((await kernel.exec('kvvideo.narration.make', { text: 'Open the app.', file: 'a.mp3' })).reused).toBe(1);
    expect(runs(piper)).toHaveLength(2);
  });

  it('M5.6-E4 M5.3-E5 the input and output rules fail before a program runs', async () => {
    const { piper, settings } = piperWorld();
    const world = await kvvideo.start({ settings });
    world.write('taken.mp3', 'old');
    const attempts = [
      { text: '', file: 'a.mp3' },
      { text: 'x'.repeat(4001), file: 'a.mp3' },
      { text: '   ', file: 'a.mp3' },
      { text: 'Hi.', file: 'a.mp3', speed: 0.69 },
      { text: 'Hi.', file: 'a.mp3', speed: 1.21 },
      { text: 'Hi.', file: 'a.mp3', tone: 'x'.repeat(301) },
      { text: 'Hi.', file: 'a.mp3', tone: '' },
      { text: 'Hi.', file: 'clip.wav' },
      { text: 'Hi.', file: 'taken.mp3' },
      { text: 'Hi.', file: '../outside.mp3' },
    ];
    for (const attempt of attempts) expect(await problemOf(world.kernel.exec('kvvideo.narration.make', attempt))).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(runs(piper)).toEqual([]);
  });

  it('M5.6-E6 an existing sidecar without its narration needs replace', async () => {
    const { piper, settings } = piperWorld();
    const world = await kvvideo.start({ settings });
    world.write('a.mp3.kvvideo.json', '{}');
    expect(await problemOf(world.kernel.exec('kvvideo.narration.make', { text: 'Hi.', file: 'a.mp3' }))).toMatchObject({ code: 'VALIDATION_FAILED', params: { path: 'a.mp3.kvvideo.json' } });
    expect(runs(piper)).toEqual([]);
    await world.kernel.exec('kvvideo.narration.make', { text: 'Hi.', file: 'a.mp3', replace: true });
    expect(JSON.parse(readFileSync(`${world.workspace}/a.mp3.kvvideo.json`, 'utf8'))).toMatchObject({ kind: 'narration', durationMs: 1000 });
  });

  it('M5.3-H6 the connector has narrate, a command with an example', async () => {
    const { kernel } = await kvvideo.start();
    const video = (await kernel.exec('kvcoder.connector.list', {})).find((connector) => connector.name === 'video');
    expect(video?.commands?.find((command) => command.name === 'narrate')).toMatchObject({ command: 'kvvideo.narration.make', query: false, examples: [expect.objectContaining({ description: "Narrate the first scene's script" })] });
  });

  it('M5.3-E1 no service, or Piper without a voice, fails NARRATION_NOT_SET; nothing is written', async () => {
    const none = await kvvideo.start();
    expect(await problemOf(none.kernel.exec('kvvideo.narration.make', { text: 'Hi.', file: 'a.mp3' }))).toMatchObject({ code: 'kvvideo/NARRATION_NOT_SET', params: { setting: 'kvvideo.narration.service' } });
    const voiceless = await kvvideo.start({ settings: piperWorld({ 'kvvideo.narration.voice': null }).settings });
    expect(await problemOf(voiceless.kernel.exec('kvvideo.narration.make', { text: 'Hi.', file: 'a.mp3' }))).toMatchObject({ code: 'kvvideo/NARRATION_NOT_SET', params: { setting: 'kvvideo.narration.voice' } });
    expect(existsSync(`${voiceless.workspace}/a.mp3`)).toBe(false);
  });

  it('M5.3-E2 a paid service without its key fails NARRATION_KEY_MISSING', async () => {
    for (const [service, secret] of [['elevenlabs', 'elevenlabs.apiKey'], ['openai', 'openai.apiKey']] as const) {
      const { kernel } = await kvvideo.start({ settings: { 'kvvideo.narration.service': service } });
      expect(await problemOf(kernel.exec('kvvideo.narration.make', { text: 'Hi.', file: 'a.mp3' }))).toMatchObject({ code: 'kvvideo/NARRATION_KEY_MISSING', params: { service, secret } });
    }
  });

  it('M5.3-E4 an ffmpeg that fails to join fails NARRATION_FAILED with its last lines; nothing is written', async () => {
    const ffmpegFails = piperWorld({ 'kvvideo.programs.ffmpeg': programs.program('ffmpeg', "console.error('Unknown encoder libmp3lame'); process.exit(1);") });
    const world = await kvvideo.start({ settings: ffmpegFails.settings });
    expect(await problemOf(world.kernel.exec('kvvideo.narration.make', { text: 'Hi.', file: 'a.mp3' }))).toMatchObject({ code: 'kvvideo/NARRATION_FAILED', params: { service: 'piper', reason: 'Unknown encoder libmp3lame' } });
    expect(existsSync(`${world.workspace}/a.mp3`)).toBe(false);
  });
});
