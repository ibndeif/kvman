import { request as httpRequest, type IncomingHttpHeaders, type OutgoingHttpHeaders } from 'node:http';
import { commandAcceptedResponseSchema, messageStatusSchema, problemSchema, type CommandAcceptedResponse, type MessageStatus, type Problem } from '@kvman/protocol';
import { vi } from 'vitest';

// A plain HTTP client that can send any header, Host included, as a DNS-rebinding page or a curl would. Each request
// opens its own connection, so none reuses a socket of a kernel an earlier test stopped on the same port.

export type HttpAnswer = { status: number; headers: IncomingHttpHeaders; text: string; json: unknown };

export type RequestOptions = { headers?: OutgoingHttpHeaders; body?: unknown; rawBody?: string | Buffer; host?: string };

export function served(port: number): string {
  return `127.0.0.1:${port}`;
}

export function send(port: number, method: string, path: string, options: RequestOptions = {}): Promise<HttpAnswer> {
  const rawBody = options.rawBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body));
  const headers: OutgoingHttpHeaders = {
    host: options.host ?? served(port),
    ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
    ...options.headers,
  };
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest({ host: '127.0.0.1', port, method, path, headers, setHost: false, agent: false }, (incoming) => {
      const chunks: Buffer[] = [];
      incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
      incoming.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        const json: unknown = text.length > 0 && String(incoming.headers['content-type']).includes('json') ? JSON.parse(text) : undefined;
        resolve({ status: incoming.statusCode ?? 0, headers: incoming.headers, text, json });
      });
    });
    outgoing.on('error', reject);
    outgoing.end(rawBody);
  });
}

let keys = 0;

export function command(port: number, type: string, payload: unknown, extra: Record<string, unknown> = {}, headers: OutgoingHttpHeaders = {}): Promise<HttpAnswer> {
  keys += 1;
  return send(port, 'POST', `/api/v1/commands/${type}`, { body: { payload, idempotencyKey: `http-${keys}`, workspaceId: 'a'.repeat(64), ...extra }, headers });
}

export type SseMessage = { event: string | undefined; id: string | undefined; data: unknown; comment: string | undefined };

// One event-stream connection, with every message it received parsed in order.
export type OpenStream = {
  status: number;
  messages: SseMessage[];
  raw: () => string;
  ended: Promise<void>;
  close(): void;
  named(event: string): SseMessage[];
  waitFor(check: (messages: SseMessage[]) => void): Promise<void>;
};

function parse(block: string): SseMessage {
  const message: SseMessage = { event: undefined, id: undefined, data: undefined, comment: undefined };
  for (const line of block.split('\n')) {
    if (line.startsWith('event: ')) message.event = line.slice(7);
    else if (line.startsWith('id: ')) message.id = line.slice(4);
    else if (line.startsWith('data: ')) message.data = JSON.parse(line.slice(6));
    else if (line.startsWith(': ')) message.comment = line.slice(2);
  }
  return message;
}

export function openStream(port: number, path: string, headers: OutgoingHttpHeaders = {}): Promise<OpenStream> {
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest({ host: '127.0.0.1', port, method: 'GET', path, headers: { host: served(port), ...headers }, setHost: false, agent: false }, (incoming) => {
      let text = '';
      let buffered = '';
      const messages: SseMessage[] = [];
      const ended = new Promise<void>((done) => {
        incoming.on('end', () => done());
        incoming.on('close', () => done());
        incoming.on('error', () => done());
      });
      incoming.setEncoding('utf8');
      incoming.on('data', (chunk: string) => {
        text += chunk;
        buffered += chunk;
        const blocks = buffered.split('\n\n');
        buffered = blocks.pop() ?? '';
        for (const block of blocks) if (!block.startsWith('retry: ')) messages.push(parse(block));
      });
      resolve({
        status: incoming.statusCode ?? 0, messages, ended, raw: () => text,
        close: () => outgoing.destroy(),
        named: (event) => messages.filter((message) => message.event === event),
        waitFor: (check) => vi.waitFor(() => check(messages), { timeout: 10_000, interval: 5 }),
      });
    });
    outgoing.on('error', reject);
    outgoing.end();
  });
}

export function problemOf(answer: HttpAnswer): Problem {
  return problemSchema.parse(answer.json);
}

export function acceptedOf(answer: HttpAnswer): CommandAcceptedResponse {
  return commandAcceptedResponseSchema.parse(answer.json);
}

export function statusOf(answer: HttpAnswer): MessageStatus {
  return messageStatusSchema.parse(answer.json);
}
