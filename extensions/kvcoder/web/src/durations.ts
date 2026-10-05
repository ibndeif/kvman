import type { Translate } from './kvman.ts';

// A time in the unit that fits (ADR 0017, 2): milliseconds under a second, one decimal under ten seconds, whole
// seconds under a minute, then minutes and seconds.
export function durationText(t: Translate, milliseconds: number): string {
  if (milliseconds < 1000) return t('kvcoder.ui.milliseconds', { count: Math.round(milliseconds) });
  if (milliseconds < 10_000) return t('kvcoder.ui.seconds', { count: (milliseconds / 1000).toFixed(1) });
  const seconds = Math.round(milliseconds / 1000);
  return seconds < 60 ? t('kvcoder.ui.seconds', { count: seconds }) : t('kvcoder.ui.minutesSeconds', { minutes: Math.floor(seconds / 60), seconds: seconds % 60 });
}
