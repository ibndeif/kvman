import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach } from 'vitest';
import { createIdGenerator, type IdGenerator } from '../src/ids.ts';
import { openDatabase, type Connection } from '../src/storage/database.ts';
import { countingRandom, fakeClock, type FakeClock } from './fake-clock.ts';

// A fresh home in a temporary folder with its database open, removed after the test; never `~/.kvman`.
export type TestHome = { home: string; database: string; connection: Connection; clock: FakeClock; ids: IdGenerator };

export function useTemporaryHomes(): () => TestHome {
  const opened: TestHome[] = [];
  afterEach(() => {
    for (const test of opened.splice(0)) {
      test.connection.close();
      rmSync(test.home, { recursive: true, force: true });
    }
  });
  return () => {
    const home = mkdtempSync(path.join(tmpdir(), 'kvman-home-'));
    const database = path.join(home, 'kvman.db');
    const clock = fakeClock();
    const test = { home, database, connection: openDatabase(database), clock, ids: createIdGenerator(clock, countingRandom()) };
    opened.push(test);
    return test;
  };
}
