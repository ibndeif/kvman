import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ProblemError, type Json } from '@kvman/sdk';
import { useFakePrograms } from './support/fake-programs.ts';
import { useKvvideo } from './support/kvvideo-kernel.ts';

const kvvideo = useKvvideo();
const programs = useFakePrograms();

// Piper writes a WAV holding its text at its -f; ffmpeg writes "MP3 of" that file at its last argument; ffprobe says
// 2.5 s. Each keeps its arguments beside itself.
const keepsArgs = "fs.writeFileSync(__filename + '.args', JSON.stringify(args));";
const piperWrites = `${keepsArgs} fs.writeFileSync(args[args.indexOf('-f') + 1], 'WAV ' + args[args.length - 1]);`;
const ffmpegWrites = `${keepsArgs} fs.writeFileSync(args[args.length - 1], 'MP3 of ' + fs.readFileSync(args[args.indexOf('-i') + 1], 'utf8'));`;
const ffprobeSays = (seconds: string): string => `${keepsArgs} console.log('${seconds}');`;

function piperWorld(overrides: Record<string, Json> = {}) {
  const piper = programs.program('piper', piperWrites);
  const ffmpeg = programs.program('ffmpeg', ffmpegWrites);
  const ffprobe = programs.program('ffprobe', ffprobeSays('2.5'));
  const settings = { 'kvvideo.narration.service': 'piper', 'kvvideo.narration.voice': '/voices/en.onnx', 'kvvideo.programs.piper': piper, 'kvvideo.programs.ffmpeg': ffmpeg, 'kvvideo.programs.ffprobe': ffprobe, ...overrides };
  return { piper, ffmpeg, ffprobe, settings };
}

const argsOf = (program: string): string[] => JSON.parse(readFileSync(`${program}.args`, 'utf8')) as string[];
const problemOf = (run: Promise<unknown>): Promise<unknown> =>
  run.then(
    () => undefined,
    (error: unknown) => (error instanceof ProblemError ? error.problem : error),
  );

describe('video narrate (16 §16.6)', { timeout: 60_000 }, () => {
  it('M5.3-H3 Piper narrates, ffmpeg makes the MP3, and the answer has the length and captions', async () => {
    const { piper, ffmpeg, settings } = piperWorld();
    const { kernel, workspace } = await kvvideo.start({ settings });
    const answer = await kernel.exec('kvvideo.narration.make', { text: 'Open the app. Then sign in.', file: 'videos/n/01.mp3' });
    expect(answer).toEqual({ file: 'videos/n/01.mp3', durationMs: 2500, captions: [{ text: 'Open the app.', startMs: 0, endMs: 1250 }, { text: 'Then sign in.', startMs: 1250, endMs: 2500 }] });
    const piperArgs = argsOf(piper);
    expect([piperArgs[0], piperArgs[1], piperArgs[2], piperArgs[4], piperArgs[5]]).toEqual(['-m', '/voices/en.onnx', '-f', '--', 'Open the app. Then sign in.']);
    expect(argsOf(ffmpeg)).toEqual(['-hide_banner', '-loglevel', 'error', '-i', piperArgs[3], '-codec:a', 'libmp3lame', '-b:a', '128k', '-y', expect.stringMatching(/narration\.mp3$/)]);
    expect(readFileSync(`${workspace}/videos/n/01.mp3`, 'utf8')).toBe('MP3 of WAV Open the app. Then sign in.');
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

  it('M5.3-E4 Piper or ffmpeg failing fails NARRATION_FAILED with its last lines; nothing is written', async () => {
    const piperFails = piperWorld({ 'kvvideo.programs.piper': programs.program('piper', "console.error('voice not found'); process.exit(1);") });
    const first = await kvvideo.start({ settings: piperFails.settings });
    expect(await problemOf(first.kernel.exec('kvvideo.narration.make', { text: 'Hi.', file: 'a.mp3' }))).toMatchObject({ code: 'kvvideo/NARRATION_FAILED', params: { service: 'piper', reason: 'voice not found' } });
    const ffmpegFails = piperWorld({ 'kvvideo.programs.ffmpeg': programs.program('ffmpeg', "console.error('Unknown encoder libmp3lame'); process.exit(1);") });
    const second = await kvvideo.start({ settings: ffmpegFails.settings });
    expect(await problemOf(second.kernel.exec('kvvideo.narration.make', { text: 'Hi.', file: 'a.mp3' }))).toMatchObject({ code: 'kvvideo/NARRATION_FAILED', params: { service: 'piper', reason: 'Unknown encoder libmp3lame' } });
    expect(existsSync(`${second.workspace}/a.mp3`)).toBe(false);
  });

  it('M5.3-E5 the input and output rules fail before a program runs', async () => {
    const { piper, settings } = piperWorld();
    const world = await kvvideo.start({ settings });
    world.write('taken.mp3', 'old');
    const attempts = [
      { text: '', file: 'a.mp3' },
      { text: 'x'.repeat(4001), file: 'a.mp3' },
      { text: 'Hi.', file: 'clip.wav' },
      { text: 'Hi.', file: 'taken.mp3' },
      { text: 'Hi.', file: '../outside.mp3' },
    ];
    for (const attempt of attempts) expect(await problemOf(world.kernel.exec('kvvideo.narration.make', attempt))).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(existsSync(`${piper}.args`)).toBe(false);
  });
});
