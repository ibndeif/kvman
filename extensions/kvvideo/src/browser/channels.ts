import type { BrowserChoice } from '../settings.ts';

/** An installed browser that Playwright can drive. */
export type Channel = 'chrome' | 'msedge';

/** The channels a choice tries, in order (plan 16 §16.4). */
export function channelsOf(choice: BrowserChoice): Channel[] {
  return choice === 'auto' ? ['chrome', 'msedge'] : [choice];
}
