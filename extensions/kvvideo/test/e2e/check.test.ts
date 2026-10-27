import { describe, expect, it } from 'vitest';
import { useKvvideo } from '../support/kvvideo-kernel.ts';

const kvvideo = useKvvideo();

describe('video check with the installed browser (16 §16.4)', () => {
  it('M5.1-H6 the installed Chrome is found and closed', async () => {
    const { kernel } = await kvvideo.start({ settings: { 'kvvideo.browser': 'chrome' } });
    expect((await kernel.exec('kvvideo.setup.get', {})).browser).toEqual({ ready: true, channel: 'chrome' });
  });
});
