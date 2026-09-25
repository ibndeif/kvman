import { Agent, request } from 'node:http';

// Load over real HTTP and SSE from outside the kernel's process (ADR 0104), with keep-alive connections as a
// browser or client library holds them.

export type Answer = { status: number; body: string };

export function keepAlive(sockets: number): Agent {
  return new Agent({ keepAlive: true, maxSockets: sockets });
}

export function post(agent: Agent, port: number, path: string, body: unknown): Promise<Answer> {
  const text = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const outgoing = request({ host: '127.0.0.1', port, path, method: 'POST', agent, headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text) } }, (incoming) => {
      const chunks: Buffer[] = [];
      incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
      incoming.on('end', () => resolve({ status: incoming.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
    });
    outgoing.on('error', reject);
    outgoing.end(text);
  });
}

export async function expectStatus(answer: Promise<Answer>, status: number): Promise<Answer> {
  const received = await answer;
  if (received.status !== status) throw new Error(`expected ${status}, got ${received.status}: ${received.body.slice(0, 300)}`);
  return received;
}

export type LiveMessage = { data: unknown; receivedAt: number };

export type LiveStream = { close(): void };

// Opens stream `streamId`, resolves after its `hello`, and hands every `live` message to `onLive` with the time it
// arrived, on the same clock the handler stamps its chunks with.
export function openLiveStream(port: number, streamId: string, onLive: (message: LiveMessage) => void): Promise<LiveStream> {
  return new Promise((resolve, reject) => {
    const outgoing = request({ host: '127.0.0.1', port, path: `/api/v1/events?stream=${streamId}`, agent: false }, (incoming) => {
      let buffered = '';
      incoming.setEncoding('utf8');
      incoming.on('data', (chunk: string) => {
        const receivedAt = performance.timeOrigin + performance.now();
        buffered += chunk;
        const blocks = buffered.split('\n\n');
        buffered = blocks.pop() ?? '';
        for (const block of blocks) {
          const lines = block.split('\n');
          const event = lines.find((line) => line.startsWith('event: '))?.slice(7);
          const data = lines.find((line) => line.startsWith('data: '))?.slice(6);
          if (event === 'hello') resolve({ close: () => outgoing.destroy() });
          if (event === 'live' && data !== undefined) onLive({ data: JSON.parse(data), receivedAt });
        }
      });
    });
    outgoing.on('error', reject);
    outgoing.end();
  });
}
