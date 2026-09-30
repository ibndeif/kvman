import type { Job, Problem } from '@kvman/sdk';
import type { ProgressChunk } from '../jobs/progress-hub.ts';
import { kernelProblem } from '../problems.ts';

// The events of a job's stream (plan 04 §4.4, ADR 0009, 42): each progress chunk of the job and of the jobs nested in
// it, then one `result` or `problem`. Chunks aren't stored, so a late client sees only new ones; a finished job answers
// at once. The stream also ends when the client leaves or kvman stops.

export type JobEventSource = {
  watchProgress(jobId: string, listener: (chunk: ProgressChunk) => void): () => void;
  waitForJob(jobId: string): Promise<Job>;
};

export type JobEvent = { event: 'progress'; data: ProgressChunk } | { event: 'result'; data: unknown } | { event: 'problem'; data: Problem };

function endOf(job: Job): JobEvent {
  if (job.status === 'succeeded') return { event: 'result', data: job.output ?? null };
  if (job.status === 'cancelled') return { event: 'problem', data: job.problem ?? kernelProblem('CANCELLED', 'The job was cancelled.').problem };
  return { event: 'problem', data: job.problem ?? kernelProblem('INTERRUPTED', 'The job ended without a Problem.').problem };
}

export async function* jobEvents(source: JobEventSource, jobId: string, stop: AbortSignal): AsyncGenerator<JobEvent> {
  const chunks: ProgressChunk[] = [];
  let ended: { job: Job } | { error: unknown } | undefined;
  let wake: () => void = () => undefined;
  const unwatch = source.watchProgress(jobId, (chunk) => {
    chunks.push(chunk);
    wake();
  });
  source.waitForJob(jobId).then(
    (job) => {
      ended = { job };
      wake();
    },
    (error: unknown) => {
      ended = { error };
      wake();
    },
  );
  const onStop = (): void => wake();
  stop.addEventListener('abort', onStop);
  try {
    for (;;) {
      for (let chunk = chunks.shift(); chunk !== undefined; chunk = chunks.shift()) yield { event: 'progress', data: chunk };
      if (ended !== undefined) {
        if ('error' in ended) throw ended.error;
        yield endOf(ended.job);
        return;
      }
      if (stop.aborted) return;
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
    }
  } finally {
    stop.removeEventListener('abort', onStop);
    unwatch();
  }
}
