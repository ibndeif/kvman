import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { useKvvideo } from '../support/kvvideo-kernel.ts';
import { useTestPages } from '../support/test-page.ts';

// With the ffmpeg and ffprobe on the PATH (plan 16 §16.10): a developer of kvvideo installs them, as Chrome.

const kvvideo = useKvvideo();
const pages = useTestPages();

const streamsSchema = z.object({ streams: z.array(z.object({ codec_type: z.string(), codec_name: z.string(), width: z.number().optional(), height: z.number().optional(), r_frame_rate: z.string(), sample_rate: z.string().optional(), channels: z.number().optional() })), format: z.object({ duration: z.string() }) });

function probe(file: string): z.output<typeof streamsSchema> {
  return streamsSchema.parse(JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels:format=duration', '-of', 'json', file], { encoding: 'utf8' })));
}

describe('a real recording (16 §16.5, ADR 0107, 25)', () => {
  it('M5.2-H5 ffprobe reads H.264 of the size at 30 frames a second, without sound, as long as durationMs', async () => {
    const { kernel, workspace } = await kvvideo.start({ settings: { 'kvvideo.browser': 'chrome' } });
    const app = await pages.app();
    const answer = await kernel.exec('kvvideo.clip.record', { url: app.url, file: 'real.mp4', width: 640, height: 360, steps: [{ do: 'click', target: 'text=Save' }, { do: 'wait', ms: 1000 }] });
    const probed = probe(`${workspace}/real.mp4`);
    expect(probed.streams).toEqual([{ codec_type: 'video', codec_name: 'h264', width: 640, height: 360, r_frame_rate: '30/1' }]);
    expect(Math.abs(Number(probed.format.duration) * 1000 - answer.durationMs)).toBeLessThan(200);
  });

  it('M5.4-H10 a recorded clip, an image, a narration, and English and Arabic captions compose into H.264 and AAC', async () => {
    const { kernel, workspace } = await kvvideo.start({ settings: { 'kvvideo.browser': 'chrome' } });
    const app = await pages.app();
    await kernel.exec('kvvideo.clip.record', { url: app.url, file: 'parts/01.mp4', width: 640, height: 360, steps: [{ do: 'wait', ms: 500 }] });
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=navy:s=320x180', '-frames:v', '1', '-y', `${workspace}/parts/title.png`]);
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-y', `${workspace}/parts/01.wav`]);
    const answer = await kernel.exec('kvvideo.video.compose', {
      file: 'tour.mp4',
      width: 640,
      height: 360,
      scenes: [
        { clip: 'parts/title.png', durationMs: 1500, captions: [{ text: 'Welcome to Notes', startMs: 0, endMs: 1500 }] },
        { clip: 'parts/01.mp4', narration: 'parts/01.wav', captions: [{ text: 'مرحبا بك في الملاحظات', startMs: 0, endMs: 2000 }] },
      ],
    });
    expect(answer.durationMs).toBe(3500);
    const probed = probe(`${workspace}/tour.mp4`);
    expect(probed.streams).toEqual([
      { codec_type: 'video', codec_name: 'h264', width: 640, height: 360, r_frame_rate: '30/1' },
      { codec_type: 'audio', codec_name: 'aac', r_frame_rate: '0/0', sample_rate: '48000', channels: 2 },
    ]);
    expect(Math.abs(Number(probed.format.duration) * 1000 - answer.durationMs)).toBeLessThan(100);
  });
});
