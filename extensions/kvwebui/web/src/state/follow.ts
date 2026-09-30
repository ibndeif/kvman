import { applyEffects } from './effects.ts';
import type { Kvwebui } from './kvwebui.ts';

// Following a job (plan 06 §6.4–§6.5): when it ends, in success or failure, the page's queries and the status items
// rerun and its effects apply. A job is followed once, however many times it's asked.

export function follow(state: Kvwebui, jobId: string): Promise<void> {
  const known = state.followed.get(jobId);
  if (known !== undefined) return known;
  const ended = new Promise<void>((resolve) => {
    const stop = state.jobs.subscribe(jobId, (event) => {
      if (event.type === 'progress') return;
      stop();
      resolve();
    });
  });
  const done = ended.then(async () => {
    state.revision.value += 1;
    await applyEffects(state, jobId);
  });
  state.followed.set(jobId, done);
  return done;
}
