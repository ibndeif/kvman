import type { Translate } from './kvman.ts';

// A time in the unit that fits (ADR 0017, 2): milliseconds under a second, one decimal under ten seconds, whole
// seconds under a minute, then minutes and seconds, and from an hour hours and minutes (ADR 0090, 6).
export function durationText(t: Translate, milliseconds: number): string {
  if (milliseconds < 1000) return t('kvcoder.ui.milliseconds', { count: Math.round(milliseconds) });
  if (milliseconds < 10_000) return t('kvcoder.ui.seconds', { count: (milliseconds / 1000).toFixed(1) });
  const seconds = Math.round(milliseconds / 1000);
  if (seconds < 60) return t('kvcoder.ui.seconds', { count: seconds });
  return seconds < 3600 ? t('kvcoder.ui.minutesSeconds', { minutes: Math.floor(seconds / 60), seconds: seconds % 60 }) : hoursText(t, seconds);
}

/** A time of an hour or more, in whole hours and minutes. */
export function hoursText(t: Translate, seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return t('kvcoder.ui.hoursMinutes', { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
}
