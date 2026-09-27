import { defineExtension } from '@kvman/sdk';
import { tickerMeta, tickerSetup } from './ticker-base.ts';

// `tick` every two hours, `daily` removed, `hourly` new; `sweep` and `broken` unchanged.
export default defineExtension(tickerMeta, tickerSetup({
  tick: { description: 'Every two hours.', every: '2h', command: 'ticker.tick' },
  sweep: { description: 'Every half hour, globally.', every: '30m', command: 'ticker.sweep' },
  broken: { description: 'Hourly, and always fails.', every: '1h', command: 'ticker.broken' },
  hourly: { description: 'At every whole hour.', cron: '0 * * * *', command: 'ticker.tick' },
}));
