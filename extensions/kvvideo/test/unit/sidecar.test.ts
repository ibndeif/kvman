import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ProblemError } from '@kvman/sdk';
import { placeOutput } from '../../src/files/place-output.ts';
import { readSidecar, sidecarOutputPath, sidecarPath, writeSidecar, type Sidecar } from '../../src/files/sidecar.ts';

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

function folder(): string {
  const made = mkdtempSync(path.join(tmpdir(), 'kvvideo-sidecar-'));
  folders.push(made);
  return made;
}

const recording: Sidecar = {
  kind: 'site',
  source: 'http://localhost:5173/',
  width: 640,
  height: 360,
  device: 'desktop',
  scale: 2,
  durationMs: 3200,
  steps: [{ do: 'click', target: 'text=Save' }],
  actions: [{ do: 'click', atMs: 500, actMs: 1100, endMs: 1150, box: { x: 10, y: 20, width: 80, height: 30 } }],
};

describe("an output's sidecar (16 §16.3, ADR 0115, 31)", () => {
  it('M5.5-H13 written beside its file and read back', () => {
    const root = folder();
    const clip = path.join(root, 'a.mp4');
    placeOutput(writeSidecar(folder(), recording), sidecarOutputPath(clip, false, 'a.mp4'));
    expect(sidecarPath(clip)).toBe(`${clip}.kvvideo.json`);
    expect(readSidecar(clip)).toEqual(recording);
    const narration: Sidecar = { kind: 'narration', durationMs: 4000, captions: [{ text: 'Hello.', startMs: 0, endMs: 4000, words: [{ text: 'Hello.', startMs: 0, endMs: 900 }] }] };
    placeOutput(writeSidecar(folder(), narration), sidecarPath(path.join(root, 'talk.mp3')));
    expect(readSidecar(path.join(root, 'talk.mp3'))).toEqual(narration);
  });

  it('M5.5-E9 a missing, unreadable, or wrongly shaped sidecar is absent', () => {
    const root = folder();
    expect(readSidecar(path.join(root, 'none.mp4'))).toBeUndefined();
    writeFileSync(sidecarPath(path.join(root, 'broken.mp4')), '{ not json');
    expect(readSidecar(path.join(root, 'broken.mp4'))).toBeUndefined();
    writeFileSync(sidecarPath(path.join(root, 'other.mp4')), JSON.stringify({ kind: 'site', source: 'x' }));
    expect(readSidecar(path.join(root, 'other.mp4'))).toBeUndefined();
  });

  it('M5.5-E10 an existing sidecar is written over only with replace', () => {
    const root = folder();
    const clip = path.join(root, 'clip.mp4');
    writeFileSync(sidecarPath(clip), '{}');
    expect(() => sidecarOutputPath(clip, false, 'clip.mp4')).toThrow(ProblemError);
    expect(sidecarOutputPath(clip, true, 'clip.mp4')).toBe(sidecarPath(clip));
  });
});
