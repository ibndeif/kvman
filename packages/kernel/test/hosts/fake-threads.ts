import type { KernelToHostFrame } from '@kvman/protocol';
import type { HostThread, HostThreadEvents, StartHostThread } from '../../src/index.ts';

export type FakeThread = HostThread & { id: number; frames: KernelToHostFrame[]; events: HostThreadEvents; terminated: boolean };

// Threads that record what the kernel sends them; `terminate` ends them the way a worker's exit does.
export function fakeThreads(): { start: StartHostThread; started: FakeThread[] } {
  const started: FakeThread[] = [];
  const start: StartHostThread = (events) => {
    const thread: FakeThread = {
      id: started.length + 1, frames: [], events, terminated: false,
      post: (frame) => thread.frames.push(frame),
      terminate: () => {
        thread.terminated = true;
        events.exit();
      },
    };
    started.push(thread);
    return thread;
  };
  return { start, started };
}
