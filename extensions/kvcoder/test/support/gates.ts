// The test's side of a BroadcastChannel gate (`gateCode` in the fixtures): `waiting` resolves once a handler waits at
// it; `release` lets it go on. BroadcastChannel reaches worker threads of the same process.

export type Gate = { waiting: Promise<void>; release(): void };

export function openGate(name: string): Gate {
  const ready = new BroadcastChannel(`${name}:ready`);
  const waiting = new Promise<void>((resolve) => {
    ready.onmessage = () => {
      ready.close();
      resolve();
    };
  });
  return {
    waiting,
    release: () => {
      const channel = new BroadcastChannel(name);
      channel.postMessage('go');
      channel.close();
    },
  };
}
