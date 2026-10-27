import { readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from '@kvman/sdk';

// kvman's own port, so a recording never reaches kvman's API as the person (ADR 0107, 18). kvman sets `KVMAN_HOME`
// in its environment and keeps its port in `<home>/kvman.lock` (plan 01 §1.2, §1.3). With no home, no lock, or a lock
// without a port, no port is kvman's.

const lockSchema = z.object({ pid: z.number(), port: z.number().int().positive().optional() });

export function ownPortOf(home: string | undefined): number | null {
  if (home === undefined || home === '') return null;
  let text: string;
  try {
    text = readFileSync(path.join(home, 'kvman.lock'), 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
  const lock = lockSchema.safeParse(JSON.parse(text));
  return lock.success && lock.data.port !== undefined ? lock.data.port : null;
}
