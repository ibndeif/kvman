import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ProblemError } from '@kvman/sdk';
import { useKvvideo } from './support/kvvideo-kernel.ts';

const kvvideo = useKvvideo();
const folders: string[] = [];

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

// A Piper voice outside every workspace, as kvvideo's tools folder holds it.
function piperVoice(withConfig = true): string {
  const folder = mkdtempSync(path.join(tmpdir(), 'kvvideo-voices-'));
  folders.push(folder);
  const voice = path.join(folder, 'ar_JO-kareem-medium.onnx');
  writeFileSync(voice, 'onnx');
  if (withConfig) writeFileSync(`${voice}.json`, '{}');
  return voice;
}

type Kernel = Awaited<ReturnType<typeof kvvideo.start>>['kernel'];

// The narration settings' values, and where each comes from.
async function narration(kernel: Kernel): Promise<[unknown, unknown][]> {
  const listed = await kernel.exec('kernel.settings.list', {});
  return ['service', 'voice', 'model'].map((name): [unknown, unknown] => {
    const setting = listed.find((entry) => entry.key === `kvvideo.narration.${name}`);
    return [setting?.value, setting?.source];
  });
}

const problemOf = (run: Promise<unknown>): Promise<unknown> =>
  run.then(
    () => undefined,
    (error: unknown) => (error instanceof ProblemError ? error.problem : error),
  );

describe('video narration-set (16 §16.4, ADR 0120, 8 and 26)', { timeout: 60_000 }, () => {
  it('M5.13-H9 Piper with a voice file anywhere', async () => {
    const { kernel } = await kvvideo.start();
    const voice = piperVoice();
    expect(await kernel.exec('kvvideo.narration.set', { service: 'piper', voice })).toEqual({});
    expect(await narration(kernel)).toEqual([['piper', 'global'], [voice, 'global'], [null, 'global']]);
  });

  it('M5.13-H10 a service by voice id and model, then its defaults', async () => {
    const { kernel } = await kvvideo.start();
    await kernel.exec('kvvideo.narration.set', { service: 'openai', voice: 'nova', model: 'gpt-4o-mini-tts' });
    expect((await narration(kernel)).map(([value]) => value)).toEqual(['openai', 'nova', 'gpt-4o-mini-tts']);
    await kernel.exec('kvvideo.narration.set', { service: 'elevenlabs' });
    expect((await narration(kernel)).map(([value]) => value)).toEqual(['elevenlabs', null, null]);
  });

  it('M5.13-E5 Piper needs a real voice file and no model, and nothing changes when it fails', async () => {
    const { kernel } = await kvvideo.start();
    await kernel.exec('kvvideo.narration.set', { service: 'openai', voice: 'nova' });
    const voice = piperVoice();
    const unconfigured = piperVoice(false);
    const tries = [
      { service: 'piper' },
      { service: 'piper', voice: voice.replace(/\.onnx$/, '.bin') },
      { service: 'piper', voice: path.join(path.dirname(voice), 'missing.onnx') },
      { service: 'piper', voice: unconfigured },
      { service: 'piper', voice: 'voices/ar.onnx' },
      { service: 'piper', voice, model: 'fast' },
    ] as const;
    for (const input of tries) expect(await problemOf(kernel.exec('kvvideo.narration.set', input))).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect((await narration(kernel)).map(([value]) => value)).toEqual(['openai', 'nova', null]);
  });

  it('M5.13-E6 an unknown service fails', async () => {
    const { kernel } = await kvvideo.start();
    expect(await problemOf(kernel.exec('kvvideo.narration.set', { service: 'azure' } as never))).toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});
