// A steady 30 frames a second from a screencast that sends a frame only when the picture changes (plan 16 §16.5):
// each frame is written again, one copy a slot, until the next one comes, and the last until the recording ends.

export const framesPerSecond = 30;

export type FrameWriter = { frame(data: Buffer, atMs: number): Promise<void>; finish(atMs: number): Promise<number> };

/** Writes frames to `sink`, timed from `startedAt` (ms); `finish` answers how many slots were written. */
export function frameWriter(sink: (frame: Buffer) => Promise<void>, startedAt: number): FrameWriter {
  let previous: Buffer | undefined;
  let written = 0;
  const slotAt = (atMs: number): number => Math.max(0, Math.round(((atMs - startedAt) * framesPerSecond) / 1000));
  const fillTo = async (slot: number): Promise<void> => {
    if (previous === undefined) return;
    while (written < slot) {
      await sink(previous);
      written += 1;
    }
  };
  return {
    frame: async (data, atMs) => {
      if (previous === undefined) previous = data;
      await fillTo(slotAt(atMs));
      previous = data;
    },
    finish: async (atMs) => {
      await fillTo(Math.max(slotAt(atMs), written + 1));
      return written;
    },
  };
}
