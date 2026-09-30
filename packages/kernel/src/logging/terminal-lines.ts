import { z } from '@kvman/sdk';
import type { DestinationStream } from 'pino';

// The short terminal log (ADR 0009, 49): each record as one English line, `HH:MM:SS LEVEL message`, on stderr. Only
// the time, level, and message are shown; a record's fields stay in `logs/kvman.log`.

const levelNames: Readonly<Record<number, string>> = { 10: 'TRACE', 20: 'DEBUG', 30: 'INFO', 40: 'WARN', 50: 'ERROR', 60: 'FATAL' };

const recordSchema = z.object({ level: z.number(), time: z.number(), msg: z.string() });

function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

export function terminalLine(record: string): string {
  const { level, time, msg } = recordSchema.parse(JSON.parse(record));
  const at = new Date(time);
  const clock = `${twoDigits(at.getHours())}:${twoDigits(at.getMinutes())}:${twoDigits(at.getSeconds())}`;
  return `${clock} ${levelNames[level] ?? String(level)} ${msg}\n`;
}

export const terminalDestination: DestinationStream = { write: (record: string) => process.stderr.write(terminalLine(record)) };
