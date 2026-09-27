import { defineExtension, z } from '@kvman/sdk';

function codeOf(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'problem' in error) {
    const { problem } = error;
    if (typeof problem === 'object' && problem !== null && 'code' in problem && typeof problem.code === 'string') return problem.code;
  }
  return 'not-a-problem';
}

// Calls kernel commands without kernel.admin, reporting the result or the problem's code.
export default defineExtension({ name: '@acme/caller', namespace: 'caller', title: 'Caller', description: 'Calls kernel commands.' }, (ext) => {
  ext.registerCommand('caller.call', {
    description: 'Calls a kernel command and reports its result or problem.', input: z.object({ type: z.string(), payload: z.json() }),
    handle: async ({ type, payload }, ctx) => {
      try {
        return { ok: true, value: await ctx.command(type, payload) };
      } catch (error) {
        return { ok: false, code: codeOf(error) };
      }
    },
  });
});
