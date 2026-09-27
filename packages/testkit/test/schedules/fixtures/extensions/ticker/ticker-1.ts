import { defineExtension } from '@kvman/sdk';
import { tickerMeta, tickerSetup } from './ticker-base.ts';

export default defineExtension(tickerMeta, tickerSetup({
  tick: { description: 'Hourly.', every: '1h', command: 'ticker.tick' },
  daily: { description: 'Every morning.', cron: '0 9 * * *', command: 'ticker.daily' },
  sweep: { description: 'Every half hour, globally.', every: '30m', command: 'ticker.sweep' },
  broken: { description: 'Hourly, and always fails.', every: '1h', command: 'ticker.broken' },
}));
