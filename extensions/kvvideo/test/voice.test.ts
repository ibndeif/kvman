import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ProblemError } from '@kvman/sdk';
import { useFakePrograms } from './support/fake-programs.ts';
import { useKvvideo } from './support/kvvideo-kernel.ts';

const kvvideo = useKvvideo();
const programs = useFakePrograms();

// ffmpeg writes `WAV:<take's content>` for a take, and joins as `JOINED<json>`; ffprobe gives a take one second per
// word of its content, and a joined file the sum with 250 ms between takes. Each run of ffmpeg is logged.
const ffmpeg = [
  "fs.appendFileSync(__filename + '.log', JSON.stringify(args) + '\\n');",
  'const output = args[args.length - 1];',
  "if (fs.readFileSync(args[args.indexOf('-i') + 1], 'utf8').includes('broken')) { console.error('Invalid data'); process.exit(1); }",
  "const inputs = args.filter((_, index) => args[index - 1] === '-i');",
  "fs.writeFileSync(output, inputs.length > 1 || output.endsWith('.mp3') ? 'JOINED' + JSON.stringify(inputs.map((input) => fs.readFileSync(input, 'utf8'))) : 'WAV:' + fs.readFileSync(inputs[0], 'utf8'));",
].join('\n');
const ffprobe = [
  'const words = (text) => text.slice(text.indexOf(":") + 1).trim().split(/\\s+/).length;',
  'const content = fs.readFileSync(args[args.length - 1], "utf8");',
  "if (!content.startsWith('JOINED')) { console.log(String(words(content))); process.exit(0); }",
  'const parts = JSON.parse(content.slice(6));',
  'console.log(String(parts.reduce((sum, part) => sum + words(part), 0) + 0.25 * (parts.length - 1)));',
].join('\n');

const runs = (program: string): string[][] => (existsSync(`${program}.log`) ? readFileSync(`${program}.log`, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as string[]) : []);
const problemOf = (run: Promise<unknown>): Promise<unknown> =>
  run.then(
    () => undefined,
    (error: unknown) => (error instanceof ProblemError ? error.problem : error),
  );

async function voicing() {
  const fakeFfmpeg = programs.program('ffmpeg', ffmpeg);
  const world = await kvvideo.start({ settings: { 'kvvideo.programs.ffmpeg': fakeFfmpeg, 'kvvideo.programs.ffprobe': programs.program('ffprobe', ffprobe) } });
  world.write('v/line-1.webm', 'one two three');
  world.write('v/line-2.m4a', 'four five');
  return { ...world, ffmpeg: fakeFfmpeg };
}

const lines = [
  { take: 'v/line-1.webm', text: 'This is Notes.' },
  { take: 'v/line-2.m4a', text: 'Sign in.' },
];

describe('video voice (16 §16.7, ADR 0115, 28 and 50)', { timeout: 60_000 }, () => {
  it('M5.10-H8 each take cleaned, joined with 250 ms between, captions from each take start; clean false only converts', async () => {
    const { kernel, workspace, ffmpeg: program } = await voicing();
    const answer = await kernel.exec('kvvideo.voice.make', { lines, file: 'v/01.mp3' });
    expect(answer).toEqual({ file: 'v/01.mp3', durationMs: 5250, captions: [{ text: 'This is Notes.', startMs: 0, endMs: 3250 }, { text: 'Sign in.', startMs: 3250, endMs: 5250 }] });
    const cleaned = runs(program).slice(0, 2);
    expect(cleaned.map((args) => args.includes('-af'))).toEqual([true, true]);
    expect(JSON.parse(readFileSync(`${workspace}/v/01.mp3.kvvideo.json`, 'utf8'))).toEqual({ kind: 'narration', durationMs: 5250, captions: answer.captions });
    expect(readFileSync(`${workspace}/v/line-1.webm`, 'utf8')).toBe('one two three');
    await kernel.exec('kvvideo.voice.make', { lines, file: 'v/02.mp3', clean: false });
    expect(runs(program).slice(3, 5).map((args) => args.includes('-af'))).toEqual([false, false]);
  });

  it('M5.10-E5 takes that are not sound, missing, or outside; too many lines; an existing output; a failing take', async () => {
    const { kernel, write, ffmpeg: program } = await voicing();
    write('v/notes.txt', 'x');
    write('v/taken.mp3', 'old');
    const attempts: [Record<string, unknown>, string][] = [
      [{ lines: [{ take: 'v/notes.txt', text: 'x' }], file: 'a.mp3' }, 'VALIDATION_FAILED'],
      [{ lines: [{ take: 'v/missing.webm', text: 'x' }], file: 'a.mp3' }, 'NOT_FOUND'],
      [{ lines: [{ take: '../out.webm', text: 'x' }], file: 'a.mp3' }, 'VALIDATION_FAILED'],
      [{ lines: Array.from({ length: 21 }, () => lines[0]), file: 'a.mp3' }, 'VALIDATION_FAILED'],
      [{ lines, file: 'v/taken.mp3' }, 'VALIDATION_FAILED'],
    ];
    for (const [input, code] of attempts) expect(await problemOf(kernel.exec('kvvideo.voice.make', input as never))).toMatchObject({ code });
    expect(runs(program)).toEqual([]);
    write('v/broken.webm', 'broken');
    expect(await problemOf(kernel.exec('kvvideo.voice.make', { lines: [lines[0] ?? { take: '', text: '' }, { take: 'v/broken.webm', text: 'x' }], file: 'b.mp3' }))).toMatchObject({ code: 'kvvideo/RENDER_FAILED', params: { take: 2, reason: 'Invalid data' } });
  });
});
