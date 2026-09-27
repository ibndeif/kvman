import { createConnection } from 'node:net';

export type Answer = { ok: true; data: unknown } | { ok: false; problem: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function answerOf(line: string): Answer {
  const parsed: unknown = JSON.parse(line);
  if (isRecord(parsed) && parsed['ok'] === true) return { ok: true, data: parsed['data'] };
  if (isRecord(parsed) && parsed['ok'] === false) return { ok: false, problem: parsed['problem'] };
  throw new Error('kernel.sock answered something that is not an answer');
}

// 12 §12.4: one request per connection, one JSON line each way.
export function request(socket: string, frame: Record<string, unknown>): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const connection = createConnection(socket);
    const chunks: Buffer[] = [];
    connection.on('data', (chunk: Buffer) => chunks.push(chunk));
    connection.on('error', reject);
    connection.on('end', () => {
      try {
        resolve(answerOf(Buffer.concat(chunks).toString('utf8').trim()));
      } catch (error) {
        reject(error);
      }
    });
    connection.end(`${JSON.stringify(frame)}\n`);
  });
}
