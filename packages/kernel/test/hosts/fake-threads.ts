import type { Capabilities, KernelToHostFrame } from '@kvman/protocol';
import { ReadPool, type GrantsSource, type HostThread, type HostThreadEvents, type StartHostThread } from '../../src/index.ts';

export type FakeThread = HostThread & { id: number; frames: KernelToHostFrame[]; events: HostThreadEvents; terminated: boolean };

// Threads that record what the kernel sends them; `terminate` ends them the way a worker's exit does.
export function fakeThreads(): { start: StartHostThread; started: FakeThread[] } {
  const started: FakeThread[] = [];
  const start: StartHostThread = (events) => {
    const thread: FakeThread = {
      id: started.length + 1, identity: { pid: process.pid, threadId: started.length + 1 }, frames: [], events, terminated: false,
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

const sharedGrant: Capabilities = { isolation: 'shared', requested: [], derived: { subscribes: [], providesLlm: [] } };

// Every extension granted nothing, at `shared` isolation, so each runs on the shared pool.
export const sharedGrants: GrantsSource = { capabilities: () => sharedGrant, disabledTools: () => new Set() };

// A read pool for tests whose hosts never read through it.
export function unusedReads(): ReadPool {
  return new ReadPool(1, () => {
    throw new Error('this test reads nothing through the read pool');
  });
}
