import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { answersVersion, ffmpegListings, useFakePrograms } from './support/fake-programs.ts';
import { useKvvideo } from './support/kvvideo-kernel.ts';

const kvvideo = useKvvideo();
const programs = useFakePrograms();

const allEncoders = ['libx264', 'aac', 'libmp3lame'];
const allFilters = ['subtitles', 'xfade', 'loudnorm', 'afftdn', 'gradients', 'perspective', 'alphamerge', 'drawtext', 'xstack'];

describe('video check (16 §16.4)', { timeout: 60_000 }, () => {
  it('M5.1-H5 check is ready when ffmpeg has everything and Piper has a voice', async () => {
    const { kernel } = await kvvideo.start({
      settings: {
        'kvvideo.programs.ffmpeg': programs.program('ffmpeg', ffmpegListings({ encoders: allEncoders, filters: [...allFilters, 'scale'] })),
        'kvvideo.programs.ffprobe': programs.program('ffprobe', answersVersion),
        'kvvideo.programs.piper': programs.program('piper', answersVersion),
        'kvvideo.narration.service': 'piper',
        'kvvideo.narration.voice': '/voices/en_US-lessac-medium.onnx',
      },
    });
    const setup = await kernel.exec('kvvideo.setup.get', {});
    expect(setup.ffmpeg).toEqual({ ready: true, version: '7.1', missing: [] });
    expect(setup.narration).toMatchObject({ service: 'piper', ready: true, missing: null });
  });

  it('M5.1-E1 ffmpeg that cannot start is missing with everything it would give, and check does not fail', async () => {
    const { kernel } = await kvvideo.start({
      settings: { 'kvvideo.programs.ffmpeg': '/nowhere/ffmpeg', 'kvvideo.programs.ffprobe': programs.program('ffprobe', answersVersion) },
    });
    const setup = await kernel.exec('kvvideo.setup.get', {});
    expect(setup.ffmpeg).toEqual({ ready: false, version: null, missing: ['ffmpeg', 'libx264', 'aac', 'libmp3lame', ...allFilters] });
  });

  it('M5.1-E2 ffmpeg without libmp3lame or libass, and no ffprobe', async () => {
    const { kernel } = await kvvideo.start({
      settings: { 'kvvideo.programs.ffmpeg': programs.program('ffmpeg', ffmpegListings({ encoders: ['libx264', 'aac'], filters: ['scale'] })), 'kvvideo.programs.ffprobe': '/nowhere/ffprobe' },
    });
    const setup = await kernel.exec('kvvideo.setup.get', {});
    expect(setup.ffmpeg).toEqual({ ready: false, version: '7.1', missing: ['ffprobe', 'libmp3lame', ...allFilters] });
  });

  it('M5.1-E5 narration reports its first missing piece through the kernel: no service, then a missing key, then ready', async () => {
    const plain = await kvvideo.start();
    expect((await plain.kernel.exec('kvvideo.setup.get', {})).narration).toMatchObject({ service: null, ready: false, missing: 'kvvideo.narration.service' });
    const keyless = await kvvideo.start({ settings: { 'kvvideo.narration.service': 'elevenlabs' } });
    expect((await keyless.kernel.exec('kvvideo.setup.get', {})).narration).toMatchObject({ service: 'elevenlabs', ready: false, missing: 'elevenlabs.apiKey' });
    const keyed = await kvvideo.start({ settings: { 'kvvideo.narration.service': 'openai' }, secrets: { 'openai.apiKey': 'sk-test' } });
    expect((await keyed.kernel.exec('kvvideo.setup.get', {})).narration).toMatchObject({ service: 'openai', ready: true, missing: null });
  });

  it('M5.7-H15 M5.9-E7 check needs the filters of the camera, the frames, the final pass, the voice, and the review, after subtitles', async () => {
    const { kernel } = await kvvideo.start({
      settings: { 'kvvideo.programs.ffmpeg': programs.program('ffmpeg', ffmpegListings({ encoders: allEncoders, filters: ['subtitles', 'scale'] })), 'kvvideo.programs.ffprobe': programs.program('ffprobe', answersVersion) },
    });
    expect((await kernel.exec('kvvideo.setup.get', {})).ffmpeg.missing).toEqual(['xfade', 'loudnorm', 'afftdn', 'gradients', 'perspective', 'alphamerge', 'drawtext', 'xstack']);
  });

  it('M5.13-H11 check answers kvvideo tools folder under kvman home', async () => {
    vi.stubEnv('KVMAN_HOME', '/home/sam/.kvman');
    try {
      const { kernel } = await kvvideo.start();
      expect((await kernel.exec('kvvideo.setup.get', {})).narration.toolsFolder).toBe(path.join('/home/sam/.kvman', 'kvvideo'));
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('M5.13-E7 no tools folder without a home', async () => {
    vi.stubEnv('KVMAN_HOME', '');
    try {
      const { kernel } = await kvvideo.start();
      expect((await kernel.exec('kvvideo.setup.get', {})).narration.toolsFolder).toBeNull();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
