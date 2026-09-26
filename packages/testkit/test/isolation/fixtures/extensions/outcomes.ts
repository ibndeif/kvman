export function codeOf(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'problem' in error) {
    const { problem } = error;
    if (typeof problem === 'object' && problem !== null && 'code' in problem && typeof problem.code === 'string') return problem.code;
  }
  if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string') return error.code;
  return 'not-a-problem';
}

// What a call returned, or the code of the problem or error it threw, so the test reads both from one reply.
export async function outcomeOf(call: () => unknown): Promise<{ result: unknown } | { code: string }> {
  try {
    return { result: (await call()) ?? null };
  } catch (error) {
    return { code: codeOf(error) };
  }
}
