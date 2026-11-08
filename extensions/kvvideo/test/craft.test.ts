import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ProblemError, z } from '@kvman/sdk';
import { runConnector } from '@kvman/kvcoder/testing';
import { craftTopics } from '../src/craft/register-craft.ts';
import { readGuide } from '../src/guide.ts';
import { useKvvideo } from './support/kvvideo-kernel.ts';

const kvvideo = useKvvideo();

const noteUrl = (topic: string): URL => new URL(`../docs/craft/${topic}.md`, import.meta.url);

const titles = { story: '# Story and script', scenes: '# Scenes', motion: '# Motion', charts: '# Charts', tutorial: '# Tutorials of an app or a website', social: '# Social clips' };

const problemOf = (run: Promise<unknown>): Promise<unknown> =>
  run.then(
    () => undefined,
    (error: unknown) => (error instanceof ProblemError ? error.problem : error),
  );

describe('video craft (16 §16.4, ADR 0121)', { timeout: 60_000 }, () => {
  it('M5.17-H1 craft answers the text of each of the six notes', async () => {
    const { kernel } = await kvvideo.start();
    expect([...craftTopics]).toEqual(['story', 'scenes', 'motion', 'charts', 'tutorial', 'social']);
    for (const topic of craftTopics) {
      const result = await runConnector(kernel, { connector: 'video', command: 'craft', payload: { topic } });
      expect(result.exitCode, topic).toBe(0);
      const { content } = z.strictObject({ content: z.string() }).parse(JSON.parse(result.output));
      expect(content).toBe(readFileSync(noteUrl(topic), 'utf8'));
      expect(content.startsWith(`${titles[topic]}\n`), topic).toBe(true);
    }
  });

  it('M5.17-H4 the six notes ship in docs/craft, which the package files hold', () => {
    for (const topic of craftTopics) expect(existsSync(noteUrl(topic)), topic).toBe(true);
    const manifest = z.object({ files: z.array(z.string()) }).parse(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')));
    expect(manifest.files).toContain('docs');
  });

  it('M5.17-E1 another topic, no topic, or another field fails VALIDATION_FAILED', async () => {
    const { kernel } = await kvvideo.start();
    for (const input of [{ topic: 'music' }, {}, { topic: 'story', depth: 2 }]) {
      expect(await problemOf(kernel.exec('kvvideo.craft.get', input as never)), JSON.stringify(input)).toMatchObject({ code: 'VALIDATION_FAILED' });
    }
  });

  it('M5.17-E2 each note is at most 8 KB, and the guide at most a section of 16 KB', () => {
    for (const topic of craftTopics) expect(Buffer.byteLength(readFileSync(noteUrl(topic), 'utf8')), topic).toBeLessThanOrEqual(8 * 1024);
    expect(Buffer.byteLength(readGuide())).toBeLessThanOrEqual(16 * 1024);
  });
});
