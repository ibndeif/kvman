export function codeOf(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'problem' in error) {
    const { problem } = error;
    if (typeof problem === 'object' && problem !== null && 'code' in problem && typeof problem.code === 'string') return problem.code;
  }
  return 'not-a-problem';
}

// What a call returned, or the code of the problem it threw, so the test reads both from one reply.
export async function outcomeOf(call: () => Promise<unknown>): Promise<{ result: unknown } | { code: string }> {
  try {
    return { result: await call() };
  } catch (error) {
    return { code: codeOf(error) };
  }
}
