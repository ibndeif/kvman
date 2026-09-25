import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { openStream, send, type OpenStream } from '../adapters/http-client.ts';
import { fixtureWorkspace } from '../child-kernel/workspace.ts';
import { crashAndRecover, faultTests } from './crash-harness.ts';
import { messagesOf } from './ledger-database.ts';

const address = 'ledger.progress.streamed:s';

// Stream S as a browser holds it: connected, then subscribed to the stream's live address (12 §12.3).
async function subscribed(port: number): Promise<OpenStream> {
  const stream = await openStream(port, '/api/v1/events?stream=S');
  await stream.waitFor((received) => expect(received.map((message) => message.event)).toContain('hello'));
  const created = await send(port, 'POST', '/api/v1/subscriptions', { body: { stream: 'S', sid: 'progress', live: [address], workspaceId: fixtureWorkspace } });
  expect(created.status).toBe(201);
  return stream;
}

describe('a crash after a live publish (plan 02 §2.3, 14 §14.3 invariant 8, ADR 0101)', faultTests, () => {
  it('M1.9-H11 live.after-publish-before-commit: no chunk of the dead attempt survives the restart', async () => {
    const streams: OpenStream[] = [];
    const run = await crashAndRecover('live.after-publish-before-commit', {
      beforeWorkload: async (port) => {
        streams.push(await subscribed(port));
      },
      afterRestart: async (port) => {
        const stream = await openStream(port, '/api/v1/events?stream=S');
        await stream.waitFor((received) => expect(received.map((message) => message.event)).toContain('hello'));
        expect(stream.named('hello')[0]?.data).toMatchObject({ subscriptions: [] });
        stream.close();
        streams.push(await subscribed(port));
      },
      atCrash: (connection) => messagesOf(connection, 'ledger.stream'),
    });
    const [before, after] = streams;
    const [streamed] = run.read((connection) => messagesOf(connection, 'ledger.stream'));
    expect(run.crashed).toMatchObject([{ state: 'running' }]);
    expect(streamed).toMatchObject({ state: 'done', attempts: 1 });
    const { token } = z.object({ token: z.string() }).parse(streamed?.result?.ok === true ? streamed.result.value : undefined);
    await after?.waitFor(() => expect(after.named('live')).toHaveLength(1));
    expect(after?.named('live')[0]?.data).toEqual({ sid: 'progress', type: 'ledger.progress.streamed', key: 's', run: streamed?.id, n: 1, chunk: { text: token } });
    for (const chunk of before?.named('live') ?? []) expect(chunk.data).not.toMatchObject({ chunk: { text: token } });
    for (const stream of streams) stream.close();
  });
});
