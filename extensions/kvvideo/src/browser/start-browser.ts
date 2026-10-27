import { kvvideoProblem } from '../problems.ts';
import type { BrowserChoice } from '../settings.ts';
import { channelsOf, type Channel } from './channels.ts';

/** The first channel of the choice that starts, or `kvvideo/BROWSER_MISSING` with the channels tried (plan 16 §16.5). */
export async function startBrowser<Started>(choice: BrowserChoice, launch: (channel: Channel) => Promise<Started>): Promise<Started> {
  const channels = channelsOf(choice);
  const reasons: string[] = [];
  for (const channel of channels) {
    try {
      return await launch(channel);
    } catch (error) {
      reasons.push(`${channel}: ${error instanceof Error ? (error.message.split('\n')[0] ?? '') : String(error)}`);
    }
  }
  throw kvvideoProblem('BROWSER_MISSING', `No installed browser could start (${reasons.join('; ')}); install Google Chrome or Microsoft Edge.`, { channels });
}
