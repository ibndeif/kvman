import type { LiveChunk } from '@kvman/protocol';

export type LiveAddress = { type: string; key: string; workspaceId: string | undefined };

// One chunk on `<type>:<key>` (02 §2.3): `run` is the message whose handler published it, `n` numbers the address's
// chunks so a consumer sees gaps.
export type LiveFrame = LiveAddress & { run: string; n: number; chunk: LiveChunk };

export type LiveListener = (frame: LiveFrame) => void;

export const liveRingSize = 1000;

function addressOf({ type, key }: LiveAddress): string {
  return `${type}:${key}`;
}

// Live events are sent at once and kept in a ring of the last 1,000 per address for late joiners (02 §2.5). A reset
// removes only its own run's chunks and is itself a chunk, so screens discard that run and nothing else.
export class LiveBus {
  readonly #rings = new Map<string, LiveFrame[]>();
  readonly #counters = new Map<string, number>();
  readonly #listeners = new Set<LiveListener>();

  subscribe(listener: LiveListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  publish(address: LiveAddress, run: string, chunk: LiveChunk): LiveFrame {
    const name = addressOf(address);
    const n = (this.#counters.get(name) ?? 0) + 1;
    this.#counters.set(name, n);
    const frame: LiveFrame = { ...address, run, n, chunk };
    const ring = this.#rings.get(name) ?? [];
    ring.push(frame);
    if (ring.length > liveRingSize) ring.splice(0, ring.length - liveRingSize);
    this.#rings.set(name, ring);
    for (const listener of this.#listeners) listener(frame);
    return frame;
  }

  reset(run: string, addresses: Iterable<LiveAddress>): void {
    for (const address of addresses) {
      const name = addressOf(address);
      this.#rings.set(name, (this.#rings.get(name) ?? []).filter((frame) => frame.run !== run));
      this.publish(address, run, { reset: true });
    }
  }

  ring(type: string, key: string): readonly LiveFrame[] {
    return this.#rings.get(addressOf({ type, key, workspaceId: undefined })) ?? [];
  }
}
