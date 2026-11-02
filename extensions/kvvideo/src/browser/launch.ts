import type { Browser } from 'playwright-core';
import type { Channel } from './channels.ts';

// The installed Chrome or Edge, driven headless through playwright-core (ADR 0107, 9): no browser is downloaded. It
// draws at 2× density, so the screencast's frames are twice the page's CSS size (ADR 0115, 8).
// playwright-core is imported when a browser starts, not when kvvideo loads, since every worker loads kvvideo and
// most never record.

export async function launchChannel(channel: Channel): Promise<Browser> {
  const { chromium } = await import('playwright-core');
  return chromium.launch({ channel, headless: true, args: ['--force-device-scale-factor=2'] });
}
