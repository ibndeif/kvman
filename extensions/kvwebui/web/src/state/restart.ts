import { kernelQuery } from '../api/kernel.ts';
import type { Kvwebui } from './kvwebui.ts';

// "Restart now" (plan 06 §6.6, ADR 0024, 9): kvman stops and starts again, so the page asks `kernel.health.get` every
// second until it answers after not answering, or answers with a smaller uptime than before, and then reloads.

export const pollMs = 1000;
const attempts = 120;

const pause = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds));

// A failed answer means kvman isn't up: the stop closed it, or the start hasn't listened yet.
const answer = (state: Kvwebui) =>
  kernelQuery(state.api, 'kernel.health.get', {}).then(
    (health) => health,
    () => undefined,
  );

/** The uptime of the kvman that is running now. */
export async function uptimeNow(state: Kvwebui): Promise<number | undefined> {
  return (await answer(state))?.uptimeMs;
}

/** True once kvman answers again; false when it doesn't within two minutes. */
export async function whenRestarted(state: Kvwebui, uptimeBefore: number | undefined): Promise<boolean> {
  let wasDown = false;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await pause(pollMs);
    const health = await answer(state);
    if (health === undefined) {
      wasDown = true;
    } else if (wasDown || (uptimeBefore !== undefined && health.uptimeMs < uptimeBefore)) {
      return true;
    }
  }
  return false;
}
