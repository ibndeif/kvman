import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ProblemError, z } from '@kvman/sdk';
import { useKvvideo } from './support/kvvideo-kernel.ts';

const kvvideo = useKvvideo();

const catalog = (language: string) => z.record(z.string(), z.string()).parse(JSON.parse(readFileSync(new URL(`../locales/${language}.json`, import.meta.url), 'utf8')));

const keys = ['kvvideo.narration.service', 'kvvideo.narration.voice', 'kvvideo.narration.model', 'kvvideo.browser', 'kvvideo.programs.ffmpeg', 'kvvideo.programs.ffprobe', 'kvvideo.programs.piper'];

describe("kvvideo's configuration (16 §16.2)", { timeout: 60_000 }, () => {
  it('M5.1-H3 the extension page has the three cards of setting rows, with their titles', async () => {
    const { kernel } = await kvvideo.start();
    const ui = await kernel.exec('kvvideo.ui.get', {});
    expect({ pages: ui.pages, nav: ui.nav, panels: ui.panels, status: ui.status }).toEqual({ pages: [], nav: [], panels: [], status: [] });
    const row = (key: string) => ({ type: 'setting', key });
    expect(ui.configuration).toEqual({
      type: 'stack',
      direction: 'vertical',
      gap: 'md',
      children: [
        { type: 'card', title: 'kvvideo.config.narration', children: keys.slice(0, 3).map(row) },
        { type: 'card', title: 'kvvideo.config.recording', children: [row('kvvideo.browser')] },
        { type: 'card', title: 'kvvideo.config.programs', children: keys.slice(4).map(row) },
      ],
    });
    for (const language of ['en', 'ar']) expect(['kvvideo.config.narration', 'kvvideo.config.recording', 'kvvideo.config.programs'].map((key) => catalog(language)[key] !== undefined)).toEqual([true, true, true]);
  });

  it('M5.1-H4 the seven settings have their defaults, scopes, and texts', async () => {
    const { kernel } = await kvvideo.start();
    const listed = (await kernel.exec('kernel.settings.list', {})).filter((setting) => setting.key.startsWith('kvvideo.'));
    expect(listed.map(({ key, value, scopes }) => ({ key, value, scopes })).sort((a, b) => a.key.localeCompare(b.key))).toEqual(
      [
        { key: 'kvvideo.browser', value: 'auto', scopes: ['global'] },
        { key: 'kvvideo.narration.model', value: null, scopes: ['global', 'workspace'] },
        { key: 'kvvideo.narration.service', value: null, scopes: ['global', 'workspace'] },
        { key: 'kvvideo.narration.voice', value: null, scopes: ['global', 'workspace'] },
        { key: 'kvvideo.programs.ffmpeg', value: 'ffmpeg', scopes: ['global'] },
        { key: 'kvvideo.programs.ffprobe', value: 'ffprobe', scopes: ['global'] },
        { key: 'kvvideo.programs.piper', value: 'piper', scopes: ['global'] },
      ],
    );
    for (const language of ['en', 'ar']) {
      const texts = catalog(language);
      expect(keys.filter((key) => texts[`${key}.title`] === undefined || texts[`${key}.description`] === undefined)).toEqual([]);
    }
  });

  it('M5.1-E6 invalid values and scopes fail VALIDATION_FAILED', async () => {
    const { kernel } = await kvvideo.start();
    const attempts = [
      { key: 'kvvideo.narration.service', value: 'azure', scope: 'global' as const },
      { key: 'kvvideo.browser', value: 'firefox', scope: 'global' as const },
      { key: 'kvvideo.programs.ffmpeg', value: '/usr/bin/ffmpeg', scope: 'workspace' as const },
    ];
    for (const attempt of attempts) {
      const failure = await kernel.exec('kernel.settings.set', attempt).then(
        () => undefined,
        (error: unknown) => error,
      );
      expect(failure).toBeInstanceOf(ProblemError);
      expect(failure instanceof ProblemError ? failure.problem.code : '').toBe('VALIDATION_FAILED');
    }
  });
});
