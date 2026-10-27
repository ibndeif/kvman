import { z, type Ctx } from '@kvman/sdk';
import { launchChannel } from '../browser/launch.ts';
import { programOf } from '../programs/programs.ts';
import { runProgram } from '../programs/run-program.ts';
import { isKvvideoProblem } from '../problems.ts';
import { narrationServices, type ProgramName } from '../settings.ts';
import { browserReadiness } from './browser-readiness.ts';
import { ffmpegReadiness, type Answer } from './ffmpeg-readiness.ts';
import { narrationReadiness } from './narration-readiness.ts';

// `video check` (plan 16 §16.4): what is ready, and what the person still has to install or set. It fails for none of
// them: a program that can't start, or doesn't answer in 5 s, is reported missing.

const checkTimeoutMs = 5_000;

const setupSchema = z.object({
  ffmpeg: z.object({ ready: z.boolean(), version: z.string().nullable(), missing: z.array(z.string()) }),
  browser: z.object({ ready: z.boolean(), channel: z.enum(['chrome', 'msedge']).nullable() }),
  narration: z.object({ service: z.enum(narrationServices).nullable(), ready: z.boolean(), missing: z.string().nullable() }),
});

async function answerOf(ctx: Ctx, name: ProgramName, args: readonly string[]): Promise<Answer> {
  try {
    const run = await runProgram(await programOf(ctx, name), args, { signal: ctx.job.signal, timeoutMs: checkTimeoutMs });
    return run.timedOut ? undefined : { exitCode: run.exitCode, stdout: run.stdout };
  } catch (error) {
    if (isKvvideoProblem(error, 'PROGRAM_MISSING')) return undefined;
    throw error;
  }
}

export function registerSetup(ctx: Ctx): void {
  ctx.registerQuery('kvvideo.setup.get', {
    description: 'Tells what is ready to make videos: ffmpeg, the installed browser, and narration, and what is missing.',
    input: z.object({}),
    output: setupSchema,
    public: true,
    timeoutMs: 60_000,
    handle: async () => {
      const run = (name: ProgramName, args: readonly string[]): Promise<Answer> => answerOf(ctx, name, args);
      const choice = { service: await ctx.settings.get('kvvideo.narration.service'), voice: await ctx.settings.get('kvvideo.narration.voice') };
      const [ffmpeg, browser, narration] = await Promise.all([
        ffmpegReadiness(run),
        browserReadiness(await ctx.settings.get('kvvideo.browser'), launchChannel),
        narrationReadiness(choice, {
          hasSecret: async (name) => (await ctx.secrets.get(name)) !== undefined,
          piperRuns: async () => (await run('piper', ['--help']))?.exitCode === 0,
        }),
      ]);
      return { ffmpeg, browser, narration };
    },
  });
}
