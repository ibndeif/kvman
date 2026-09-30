import { describe, expect, it } from 'vitest';
import { callerSchema, z } from '@kvman/sdk';
import { entry, useHarness } from '../extension-folders.ts';

const harness = useHarness();

const jobAnswer = z.object({ id: z.string(), rootId: z.string(), workspaceId: z.string(), caller: callerSchema });

const jobs = {
  name: '@test/jobs',
  namespace: 'jobs',
  entry: entry(`
    for (const call of [() => ctx.job, () => ctx.store]) {
      try { call(); } catch (error) { ctx.log.info('outside a job', { code: (error as ProblemError).problem.code }); }
    }
    const job = z.object({ id: z.string(), rootId: z.string(), workspaceId: z.string(), caller: z.unknown() });
    const describeJob = () => ({ id: ctx.job.id, rootId: ctx.job.rootId, workspaceId: ctx.job.workspace.id, caller: ctx.job.caller });
    ctx.registerQuery('jobs.who-get', { description: 'Describes its job after a moment.', input: z.object({}), output: job, public: true,
      handle: async () => { await new Promise((resolve) => setTimeout(resolve, 20)); return describeJob(); } });
    ctx.registerQuery('jobs.nested-get', { description: 'Describes its job and a nested one.', input: z.object({}), output: z.object({ outer: job, inner: job }), public: true,
      handle: async () => ({ outer: describeJob(), inner: job.parse(await ctx.exec('jobs.who-get', {})) }) });
  `),
};

describe('the current job (02 §2.2)', () => {
  it('M1.4-H4 32 interleaved jobs keep their own job and caller, and nested calls on a full worker complete', async () => {
    const kernel = await harness.start([jobs], { settings: { 'kernel.workerConcurrency': 32 } });
    const callers = Array.from({ length: 32 }, (_, index) => (index % 2 === 0 ? undefined : `@test/caller-${index}`));
    const answers = await Promise.all(callers.map(async (as) => jobAnswer.parse(await kernel.exec('jobs.who-get', {}, as === undefined ? {} : { as }))));
    expect(new Set(answers.map((answer) => answer.id)).size).toBe(32);
    answers.forEach((answer, index) => {
      const as = callers[index];
      expect(answer.caller).toEqual(as === undefined ? { kind: 'user' } : { kind: 'extension', name: as });
      expect(answer).toMatchObject({ rootId: answer.id, workspaceId: 'home' });
    });
    const nested = await Promise.all(Array.from({ length: 32 }, () => kernel.exec('jobs.nested-get', {})));
    expect(nested).toHaveLength(32);
  });

  it('M1.4-E21 ctx.job and ctx.store fail NO_JOB outside a handler', async () => {
    const kernel = await harness.start([jobs]);
    const codes = harness.logLines(kernel).filter((line) => line['msg'] === 'outside a job').map((line) => line['code']);
    expect(codes).toEqual(['NO_JOB', 'NO_JOB']);
  });

  it('M1.4-E22 a nested call has its own id, the root id, the workspace, and the calling extension', async () => {
    const kernel = await harness.start([jobs]);
    const { outer, inner } = z.object({ outer: jobAnswer, inner: jobAnswer }).parse(await kernel.exec('jobs.nested-get', {}));
    expect(inner.id).not.toBe(outer.id);
    expect(inner).toMatchObject({ rootId: outer.id, workspaceId: outer.workspaceId, caller: { kind: 'extension', name: '@test/jobs' } });
  });
});
