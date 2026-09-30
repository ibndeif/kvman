import type { StreamEvent } from '@kvman/sdk/web';
import type { JobStreams } from './job-streams.ts';

// `kvman.stream(jobId)` (ADR 0009, 83): an async iterable of the job's events that ends after its result or Problem,
// when the reader breaks out, or when `close` runs (the component unmounted).

export type EventReader = { iterator: AsyncIterator<StreamEvent>; close(): void };

const finished: IteratorReturnResult<undefined> = { done: true, value: undefined };

export function readEvents(jobs: JobStreams, jobId: string, onClose: () => void): EventReader {
  const queue: StreamEvent[] = [];
  let waiting: ((result: IteratorResult<StreamEvent>) => void) | undefined;
  let ended = false;
  let closed = false;
  const stop = jobs.subscribe(jobId, (event) => {
    if (event.type !== 'progress') ended = true;
    if (waiting === undefined) queue.push(event);
    else waiting({ done: false, value: event });
    waiting = undefined;
  });
  const close = (): void => {
    if (closed) return;
    closed = true;
    stop();
    onClose();
    waiting?.(finished);
    waiting = undefined;
  };
  const iterator: AsyncIterator<StreamEvent> = {
    next: () => {
      const event = queue.shift();
      if (event !== undefined) return Promise.resolve({ done: false, value: event });
      if (ended || closed) {
        close();
        return Promise.resolve(finished);
      }
      return new Promise((resolve) => {
        waiting = resolve;
      });
    },
    return: () => {
      close();
      return Promise.resolve(finished);
    },
  };
  return { iterator, close };
}
