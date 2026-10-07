// The date line a person's message is sent with (plan 08 §8.2; ADR 0032, 5). It comes from the message's stored time
// alone, so every step sends the same text and the provider's cache still matches.

const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

const twoDigits = (value: number): string => String(value).padStart(2, '0');

function offsetText(offsetMinutes: number): string {
  const size = Math.abs(offsetMinutes);
  return `${offsetMinutes < 0 ? '-' : '+'}${twoDigits(Math.floor(size / 60))}:${twoDigits(size % 60)}`;
}

/** `[<weekday> <YYYY-MM-DD> <HH:mm> <±HH:mm>]` for an ISO time, at an offset from UTC in minutes (east is positive). */
export function messageStamp(createdAt: string, offsetMinutes: number): string {
  const local = new Date(Date.parse(createdAt) + offsetMinutes * 60_000);
  const date = `${local.getUTCFullYear()}-${twoDigits(local.getUTCMonth() + 1)}-${twoDigits(local.getUTCDate())}`;
  const time = `${twoDigits(local.getUTCHours())}:${twoDigits(local.getUTCMinutes())}`;
  return `[${weekdays[local.getUTCDay()] ?? ''} ${date} ${time} ${offsetText(offsetMinutes)}]`;
}
