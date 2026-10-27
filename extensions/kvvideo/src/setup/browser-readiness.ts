import { channelsOf, type Channel } from '../browser/channels.ts';
import type { BrowserChoice } from '../settings.ts';

// Whether an installed browser starts (plan 16 §16.4): each channel of the choice is started headless, in order, and
// the first that starts is closed again.

/** A started browser. */
export type Started = { close(): Promise<void> };

/** Starts one channel headless, or rejects when it can't. */
export type Launch = (channel: Channel) => Promise<Started>;

export type BrowserReadiness = { ready: boolean; channel: Channel | null };

async function starts(launch: Launch, channel: Channel): Promise<boolean> {
  const browser = await launch(channel).then(
    (started) => started,
    () => undefined,
  );
  if (browser === undefined) return false;
  await browser.close();
  return true;
}

export async function browserReadiness(choice: BrowserChoice, launch: Launch): Promise<BrowserReadiness> {
  for (const channel of channelsOf(choice)) {
    if (await starts(launch, channel)) return { ready: true, channel };
  }
  return { ready: false, channel: null };
}
