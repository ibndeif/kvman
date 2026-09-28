import { createUlidGenerator, EventHub, HttpAdapter } from '@kvman/kernel';
import type { UiFixture } from './harness.ts';

export async function openUiHttp(fixture: UiFixture): Promise<{ port: number; close(): Promise<void> }> {
  const ids = createUlidGenerator(Date.now);
  const adapter = new HttpAdapter({ ids, timers: fixture.timers, logger: { write: (record) => fixture.logged.push(record) } });
  const port = await adapter.bind({ from: 39000, to: 39999 }, ids.next());
  const hub = new EventHub({
    connection: fixture.connection, files: fixture.runtime.files.files, pipeline: fixture.runtime.pipeline,
    live: fixture.runtime.live, timers: fixture.timers, version: '0.0.0', now: () => fixture.timers.time.value,
  });
  adapter.open({ runtime: fixture.runtime, hub });
  return { port, close: () => adapter.close() };
}
