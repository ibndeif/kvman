import { performance } from 'node:perf_hooks';
import type { Ctx } from '@kvman/sdk';
import { launchChannel } from '../browser/launch.ts';
import { startBrowser } from '../browser/start-browser.ts';
import { answerPath } from '../files/answer-path.ts';
import { placeOutput, workFolder } from '../files/place-output.ts';
import { outputPath } from '../files/workspace-paths.ts';
import { programOf } from '../programs/programs.ts';
import { localAddress } from './address.ts';
import { ownPortOf } from './own-port.ts';
import { record } from './recorder.ts';
import { recordInputSchema, recordOutputSchema } from './steps.ts';

// `video record` (plan 16 §16.5): every address and the output are checked before a browser starts; the browser is
// closed when the call ends, fails, or is cancelled, and the work folder removed.

export function registerRecord(ctx: Ctx): void {
  ctx.registerCommand('kvvideo.clip.record', {
    description: 'Records a page of an app running on this computer, with its steps, as an MP4 file in the workspace.',
    input: recordInputSchema,
    output: recordOutputSchema,
    public: true,
    retries: 0,
    timeoutMs: 600_000,
    handle: async (input) => {
      const root = ctx.job.workspace.path;
      const ownPort = ownPortOf(process.env['KVMAN_HOME']);
      const url = localAddress(input.url, ownPort).href;
      for (const step of input.steps ?? []) if (step.do === 'goto') localAddress(step.url, ownPort);
      const output = outputPath(root, input.file, '.mp4', input.replace === true);
      const ffmpeg = await programOf(ctx, 'ffmpeg');
      const browser = await startBrowser(await ctx.settings.get('kvvideo.browser'), launchChannel);
      const work = workFolder();
      const stop = (): void => void browser.close();
      ctx.job.signal.addEventListener('abort', stop, { once: true });
      try {
        const plan = { url, steps: input.steps ?? [], width: input.width ?? 1280, height: input.height ?? 720, folder: work.folder, ownPort, ffmpeg, signal: ctx.job.signal, now: () => performance.now() };
        const recording = await record(browser, plan);
        placeOutput(recording.video, output);
        return { file: answerPath(root, output), durationMs: recording.durationMs, steps: recording.steps };
      } finally {
        ctx.job.signal.removeEventListener('abort', stop);
        await browser.close();
        work.remove();
      }
    },
  });
}
