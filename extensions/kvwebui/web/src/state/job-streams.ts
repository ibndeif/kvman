import type { StreamEvent } from '@kvman/sdk/web';
import type { Api } from '../api/client.ts';

// Jobs' streams in the browser (plan 04 §4.4): one HTTP stream per job, shared by everyone reading it, which closes when
// the job ends or its last reader leaves.

export type StreamListener = (event: StreamEvent) => void;

export type JobStreams = { subscribe(jobId: string, listener: StreamListener): () => void };

type Connection = { listeners: Set<StreamListener>; abort: AbortController };

export function createJobStreams(api: Api): JobStreams {
  const connections = new Map<string, Connection>();
  const forget = (jobId: string, connection: Connection): void => {
    if (connections.get(jobId) === connection) connections.delete(jobId);
  };
  const pump = async (jobId: string, connection: Connection): Promise<void> => {
    for await (const event of api.stream(jobId, connection.abort.signal)) for (const listener of [...connection.listeners]) listener(event);
    forget(jobId, connection);
  };
  const open = (jobId: string): Connection => {
    const connection: Connection = { listeners: new Set(), abort: new AbortController() };
    connections.set(jobId, connection);
    void pump(jobId, connection);
    return connection;
  };
  return {
    subscribe: (jobId, listener) => {
      const connection = connections.get(jobId) ?? open(jobId);
      connection.listeners.add(listener);
      return () => {
        connection.listeners.delete(listener);
        if (connection.listeners.size > 0) return;
        connection.abort.abort();
        forget(jobId, connection);
      };
    },
  };
}
