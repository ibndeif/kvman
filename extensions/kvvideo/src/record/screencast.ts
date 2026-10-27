import type { Page } from 'playwright-core';
import { z } from '@kvman/sdk';

// The page's screencast (plan 16 §16.5): Chrome sends a JPEG frame when the picture changes, and the next one only
// after the last is acknowledged, so frames are handled one at a time, in order, at the pace the writer takes them. A
// frame that can't be handled stops the rest, and `stop` throws its error.

const frameSchema = z.object({ data: z.string(), sessionId: z.number() });

export type Screencast = { stop(): Promise<void> };

export async function startScreencast(page: Page, size: { width: number; height: number }, onFrame: (data: Buffer, atMs: number) => Promise<void>, now: () => number): Promise<Screencast> {
  const session = await page.context().newCDPSession(page);
  let handled: Promise<void> = Promise.resolve();
  let stopped = false;
  let failure: unknown;
  session.on('Page.screencastFrame', (event: unknown) => {
    const frame = frameSchema.parse(event);
    const atMs = now();
    handled = handled.then(async () => {
      if (stopped || failure !== undefined) return;
      try {
        await onFrame(Buffer.from(frame.data, 'base64'), atMs);
        await session.send('Page.screencastFrameAck', { sessionId: frame.sessionId });
      } catch (error) {
        failure = error;
      }
    });
  });
  await session.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: size.width, maxHeight: size.height, everyNthFrame: 1 });
  return {
    stop: async () => {
      stopped = true;
      await session.send('Page.stopScreencast');
      await handled;
      await session.detach();
      if (failure !== undefined) throw failure;
    },
  };
}
