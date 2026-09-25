import type { Ctx } from '@kvman/sdk';

// Per-worker observations the host tests read back through queries.
export const workerState = { setupRuns: 0, fetchRuns: 0, late: [] as string[] };

export function codeOf(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'problem' in error) {
    const { problem } = error;
    if (typeof problem === 'object' && problem !== null && 'code' in problem && typeof problem.code === 'string') return problem.code;
  }
  return 'not-a-problem';
}

export async function codeOfCall(call: () => unknown): Promise<string> {
  try {
    await call();
    return 'ok';
  } catch (error) {
    return codeOf(error);
  }
}

// Runs `effect` in a step and reports whether it ran in this attempt, so a handler can fail only on its first run.
export async function firstRun(ctx: Ctx, name: string): Promise<boolean> {
  let ran = false;
  await ctx.step(name, async () => {
    ran = true;
    return null;
  });
  return ran;
}
