import { performance } from 'node:perf_hooks';
import type { Ctx } from '@kvman/sdk';
import { launchChannel } from '../browser/launch.ts';
import { startBrowser } from '../browser/start-browser.ts';
import { answerPath } from '../files/answer-path.ts';
import { placeOutput, workFolder } from '../files/place-output.ts';
import { readSidecar, sidecarOutputPath, writeSidecar } from '../files/sidecar.ts';
import { inputPath, outputPath } from '../files/workspace-paths.ts';
import { programOf } from '../programs/programs.ts';
import { invalid } from '../problems.ts';
import { audioExtensions } from '../compose/scene-plan.ts';
import { recordableAddress } from './address.ts';
import { cuesOf, type Cues } from './narration-cues.ts';
import { ownPortOf } from './own-port.ts';
import { record, type RecordSource } from './recorder.ts';
import { defaultSize, sourceOf } from './record-source.ts';
import { sceneAssetsOf } from './scene-address.ts';
import { recordInputSchema, recordOutputSchema, type RecordInput } from './steps.ts';

// `video record` (plan 16 §16.5): the addresses, the page, the narration, and the outputs are checked before a browser
// starts; the browser is closed when the call ends, fails, or is cancelled, and the work folder removed. The
// recording's sidecar is placed beside it (ADR 0115, 31).

function recordSourceOf(root: string, input: RecordInput, ownPort: number | null): RecordSource {
  for (const step of input.steps ?? []) if (step.do === 'goto') recordableAddress(step.url, ownPort);
  return sourceOf(root, input, ownPort);
}

function cuesFor(root: string, input: RecordInput): Cues | undefined {
  if (input.narration === undefined) return undefined;
  const narration = readSidecar(inputPath(root, input.narration, audioExtensions));
  if (narration?.kind !== 'narration') throw invalid(`${input.narration} has no captions beside it; make it with narrate or voice.`, { path: input.narration });
  const lines = narration.captions.length;
  for (const step of input.steps ?? []) {
    if (step.do !== 'wait' && step.atLine !== undefined && step.atLine > lines) throw invalid(`atLine ${String(step.atLine)} is past the narration's ${String(lines)} caption lines.`, { atLine: step.atLine, lines });
  }
  return cuesOf(narration);
}

export function registerRecord(ctx: Ctx): void {
  ctx.registerCommand('kvvideo.clip.record', {
    description: 'Records a website or an HTML page of the workspace, with its steps, as an MP4 file in the workspace.',
    input: recordInputSchema,
    output: recordOutputSchema,
    public: true,
    retries: 0,
    timeoutMs: 600_000,
    handle: async (input) => {
      const root = ctx.job.workspace.path;
      const ownPort = ownPortOf(process.env['KVMAN_HOME']);
      const source = recordSourceOf(root, input, ownPort);
      const cues = cuesFor(root, input);
      const replace = input.replace === true;
      const output = outputPath(root, input.file, '.mp4', replace);
      const sidecar = sidecarOutputPath(output, replace, input.file);
      const device = input.device ?? 'desktop';
      const width = input.width ?? defaultSize[device].width;
      const height = input.height ?? defaultSize[device].height;
      const ffmpeg = await programOf(ctx, 'ffmpeg');
      const browser = await startBrowser(await ctx.settings.get('kvvideo.browser'), launchChannel);
      const work = workFolder();
      const stop = (): void => void browser.close();
      ctx.job.signal.addEventListener('abort', stop, { once: true });
      try {
        const stepStarted = (n: number, of: number): void => ctx.job.progress({ key: 'kvvideo.progress.step', params: { n, of } });
        const assets = sceneAssetsOf(root, await ctx.settings.get('kvvideo.brand'));
        const recording = await record(browser, { source, steps: input.steps ?? [], width, height, device, cues, folder: work.folder, ownPort, assets, ffmpeg, signal: ctx.job.signal, now: () => performance.now(), stepStarted });
        const steps = input.steps ?? [];
        const sourceName = source.kind === 'site' ? source.url : answerPath(root, source.file);
        const made = writeSidecar(work.folder, { kind: source.kind, source: sourceName, width, height, device, scale: 2, durationMs: recording.durationMs, steps: [...steps], actions: recording.actions });
        placeOutput(recording.video, output);
        placeOutput(made, sidecar);
        return { file: answerPath(root, output), durationMs: recording.durationMs, steps: recording.actions, failed: recording.failed };
      } finally {
        ctx.job.signal.removeEventListener('abort', stop);
        await browser.close();
        work.remove();
      }
    },
  });
}
