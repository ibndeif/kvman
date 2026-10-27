import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ProblemError } from '@kvman/sdk';
import { inputPath, outputPath } from '../../src/files/workspace-paths.ts';

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

function workspace(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'kvvideo-workspace-'));
  folders.push(root);
  return root;
}

const codeOf = (run: () => unknown): string | undefined => {
  try {
    run();
    return undefined;
  } catch (error) {
    return error instanceof ProblemError ? error.problem.code : String(error);
  }
};

describe('where kvvideo reads and writes (16 §16.3)', () => {
  it('M5.2-E6 an output has its extension, stays inside, and replaces only when asked', () => {
    const root = workspace();
    const outside = workspace();
    writeFileSync(path.join(root, 'clip.mp4'), 'old');
    symlinkSync(outside, path.join(root, 'away'));
    expect(codeOf(() => outputPath(root, 'clip.mp4', '.mp4', false))).toBe('VALIDATION_FAILED');
    expect(codeOf(() => outputPath(root, 'clip.mp4', '.mp4', true))).toBeUndefined();
    expect(codeOf(() => outputPath(root, 'clip.webm', '.mp4', false))).toBe('VALIDATION_FAILED');
    expect(codeOf(() => outputPath(root, '../outside.mp4', '.mp4', false))).toBe('VALIDATION_FAILED');
    expect(codeOf(() => outputPath(root, 'away/inside-link.mp4', '.mp4', false))).toBe('VALIDATION_FAILED');
    expect(codeOf(() => outputPath(root, 'NEW/CLIP.MP4', '.mp4', false))).toBeUndefined();
    expect(outputPath(root, 'a/b/c.mp4', '.mp4', false)).toBe(path.join(root, 'a/b/c.mp4'));
  });

  it('M5.2-E6 an input exists, inside, with one of its extensions', () => {
    const root = workspace();
    mkdirSync(path.join(root, 'parts'));
    writeFileSync(path.join(root, 'parts/one.mp3'), 'audio');
    expect(inputPath(root, 'parts/one.mp3', ['.mp3', '.wav'])).toBe(path.join(root, 'parts/one.mp3'));
    expect(codeOf(() => inputPath(root, 'parts/two.mp3', ['.mp3']))).toBe('NOT_FOUND');
    expect(codeOf(() => inputPath(root, 'parts/one.mp3', ['.wav']))).toBe('VALIDATION_FAILED');
    expect(codeOf(() => inputPath(root, 'parts', ['']))).toBe('NOT_FOUND');
  });
});
