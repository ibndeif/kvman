import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { api, queue, untilJob } from '../support/api.ts';
import { startKvman } from '../support/kvman-child.ts';
import { useSandbox } from '../support/sandbox.ts';

const sandbox = useSandbox();

type StreamEvent = { event: string; data: unknown };

// Reads a job's stream to its end as `{ event, data }` items.
async function readEvents(response: Response): Promise<StreamEvent[]> {
  const text = await response.text();
  return text
    .split('\n\n')
    .filter((block) => block.trim() !== '')
    .map((block) => {
      const lines = block.split('\n');
      const field = (name: string): string => lines.find((line) => line.startsWith(`${name}: `))?.slice(name.length + 2) ?? '';
      return { event: field('event'), data: JSON.parse(field('data')) };
    });
}

describe('the job stream (04 §4.4, ADR 0009, 42)', { timeout: 60_000 }, () => {
  it("M1.7-H3 the stream delivers the job's and a nested job's progress, then the result, and closes", async () => {
    const world = sandbox();
    const kvman = await startKvman(world, ['--preset', world.appPreset()]);
    const calls = api(kvman.port);
    const jobId = await queue(kvman.port, 'app.stream', { gate: 'stream' });
    const response = await calls.fetch(`/api/jobs/${jobId}/stream`);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    await calls.command('app.release', { gate: 'stream' });
    const events = await readEvents(response);
    expect(events).toEqual([
      { event: 'progress', data: { source: '@test/app', data: { step: 'outer' } } },
      { event: 'progress', data: { source: '@test/app', data: { step: 'inner' } } },
      { event: 'result', data: { done: true } },
    ]);
  });

  it("M1.7-H4 a finished job's stream answers at once", async () => {
    const world = sandbox();
    const kvman = await startKvman(world, ['--preset', world.appPreset()]);
    const jobId = await queue(kvman.port, 'app.echo', { text: 'done' });
    await untilJob(kvman.port, jobId, (job) => job.status === 'succeeded');
    expect(await readEvents(await api(kvman.port).fetch(`/api/jobs/${jobId}/stream`))).toEqual([{ event: 'result', data: { text: 'done' } }]);
  });

  it("M1.7-E16 the stream of an unknown id, or of a sync job's id, is the NOT_FOUND envelope", async () => {
    const world = sandbox();
    const calls = api((await startKvman(world, ['--preset', world.appPreset()])).port);
    const { jobId } = z.object({ jobId: z.string() }).parse(await calls.command('app.echo', { text: 'sync' }));
    for (const id of ['01a0f271-0000-7000-8000-000000000000', jobId]) {
      expect(await (await calls.fetch(`/api/jobs/${id}/stream`)).json()).toEqual({ ok: false, problem: expect.objectContaining({ code: 'NOT_FOUND' }) });
    }
  });
});
