import { z, type Ctx } from '@kvman/sdk';
import { launchChannel } from '../browser/launch.ts';
import { startBrowser } from '../browser/start-browser.ts';
import { trimOldest } from '../narration/narration-cache.ts';
import { ownPortOf } from '../record/own-port.ts';
import { defaultSize, sourceOf } from '../record/record-source.ts';
import { sceneAssetsOf } from '../record/scene-address.ts';
import { lookAt } from './look-at.ts';
import { lookInputSchema, lookOutputSchema } from './look-input.ts';

// `video look` (plan 16 §16.5 Looking; ADR 0117, 4 and 19): a page's or a website's frames at chosen moments, which the
// model sees through kvcoder (`images: true`), to check a scene before it is narrated and recorded. The source is
// checked before a browser starts; the browser is closed when the call ends, fails, or is cancelled. The newest 24
// frames of the workspace are kept in the kernel's files.

const keptFrames = 24;

const frameRowSchema = z.object({ fileId: z.string(), createdAt: z.string() });

export function registerLook(ctx: Ctx): void {
  ctx.registerCommand('kvvideo.frame.capture', {
    description: "Shows a website's or an HTML page's frames at chosen moments of its clock, to look at a scene before it is recorded.",
    input: lookInputSchema,
    output: lookOutputSchema,
    public: true,
    retries: 0,
    timeoutMs: 120_000,
    handle: async (input) => {
      const ownPort = ownPortOf(process.env['KVMAN_HOME']);
      const source = sourceOf(ctx.job.workspace.path, input, ownPort);
      const device = input.device ?? 'desktop';
      const size = { width: input.width ?? defaultSize[device].width, height: input.height ?? defaultSize[device].height };
      const browser = await startBrowser(await ctx.settings.get('kvvideo.browser'), launchChannel);
      const stop = (): void => void browser.close();
      ctx.job.signal.addEventListener('abort', stop, { once: true });
      try {
        const assets = sceneAssetsOf(ctx.job.workspace.path, await ctx.settings.get('kvvideo.brand'));
        const { frames, failed } = await lookAt(browser, { source, ...size, device, ownPort, assets, moments: input.atMs ?? [1000] });
        const images = [];
        for (const [index, frame] of frames.entries()) {
          const name = `look-${String(index + 1)}.jpg`;
          const stored = await ctx.files.write(name, frame.image, 'image/jpeg');
          images.push({ fileId: stored.id, name, atMs: frame.atMs });
        }
        const rows = ctx.store.collection('lookFrames', frameRowSchema);
        for (const image of images) await rows.insert({ fileId: image.fileId, createdAt: new Date().toISOString() });
        await trimOldest(rows, ctx.files, keptFrames);
        return { images, failed };
      } finally {
        ctx.job.signal.removeEventListener('abort', stop);
        await browser.close();
      }
    },
  });
}
