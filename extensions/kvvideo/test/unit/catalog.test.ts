import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { kvvideoCodes } from '../../src/problems.ts';

const catalog = (language: string) => z.record(z.string(), z.string()).parse(JSON.parse(readFileSync(new URL(`../../locales/${language}.json`, import.meta.url), 'utf8')));

describe("kvvideo's texts (16 §16.9)", () => {
  it('M5.1-E9 en and ar have the same keys, with every error code, the slash texts, and the note', () => {
    const en = catalog('en');
    const ar = catalog('ar');
    expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort());
    const required = [...kvvideoCodes.map((code) => `kvvideo.errors.${code}`), 'kvvideo.slash.video', 'kvvideo.slash.video.message', 'kvvideo.video.started'];
    expect(required.filter((key) => en[key] === undefined)).toEqual([]);
    expect(en['kvvideo.slash.video']).toBe('Make videos in this chat');
    expect(ar['kvvideo.slash.video']).toBe('اصنع فيديوهات في هذه المحادثة');
  });
});
