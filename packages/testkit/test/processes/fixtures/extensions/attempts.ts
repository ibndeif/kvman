import type { Json } from '@kvman/protocol';

function problemOf(error: unknown): Json {
  if (typeof error === 'object' && error !== null && 'problem' in error) {
    const { problem } = error;
    if (typeof problem === 'object' && problem !== null && 'code' in problem && typeof problem.code === 'string') {
      const params: Json = 'params' in problem ? JSON.parse(JSON.stringify(problem.params)) : null;
      const hint = 'hint' in problem && typeof problem.hint === 'string' ? { hint: problem.hint } : {};
      return { code: problem.code, ...(params === null ? {} : { params }), ...hint };
    }
  }
  return { code: 'not-a-problem' };
}

// What a call returned as `{ value }`, or the code, params, and hint of the problem it threw, so a test reads both.
export async function attempt(call: () => Promise<Json | undefined>): Promise<Json> {
  try {
    return { value: (await call()) ?? null };
  } catch (error) {
    return problemOf(error);
  }
}
