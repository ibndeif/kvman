import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

// A scripted OpenAI-compatible streaming server on 127.0.0.1 (plan 07 §7.4, ADR 0009, 62). Each queued reply answers one
// `POST /v1/chat/completions`, in order, as Chat Completions server-sent events or as an error status.

/** A tool call: its arguments in one piece, or as the pieces of their JSON text (which together are valid JSON). */
export type FakeToolCall = { id: string; name: string } & ({ arguments: Record<string, unknown> } | { argumentPieces: readonly string[] });

/** A piece of a scripted stream: text, thinking, a tool call, or a pause until the promise settles. */
export type FakeChunk = { text: string } | { thinking: string } | { toolCall: FakeToolCall } | { wait: Promise<void> };

/** The tokens the fake server reports, counted as pi-ai counts them: `input` excludes cache reads and writes. */
export type FakeUsage = { input: number; output: number; cacheRead?: number; cacheWrite?: number };

/** One scripted answer: a stream (its finish defaults to `tool_calls` when it calls a tool, else `stop`), or an error. */
export type FakeReply =
  | { chunks: readonly FakeChunk[]; finish?: 'stop' | 'length' | 'tool_calls'; usage?: FakeUsage }
  | { status: number; body: unknown };

/** A request the fake server got; `state` becomes `aborted` when the client closes it before the answer ends. */
export type FakeRequest = { authorization: string | undefined; body: unknown; state: 'answering' | 'answered' | 'aborted' };

/** The fake server. */
export type FakeOpenAI = {
  /** The base URL to add as a provider's `baseUrl`. */
  baseUrl: string;
  /** Queues replies; each answers the next request. */
  reply(...replies: FakeReply[]): void;
  /** Every request so far, oldest first. */
  requests(): readonly FakeRequest[];
  /** Stops the server and drops open connections. */
  close(): Promise<void>;
};

const noReply = { error: { message: 'The fake OpenAI server has no reply queued.', type: 'server_error' } };

function chunkEvent(delta: Record<string, unknown>, finish: string | null): unknown {
  return { id: 'chatcmpl-fake', object: 'chat.completion.chunk', created: 0, model: 'fake', choices: [{ index: 0, delta, finish_reason: finish }] };
}

function usageEvent(usage: FakeUsage): unknown {
  const cacheRead = usage.cacheRead ?? 0;
  const cacheWrite = usage.cacheWrite ?? 0;
  return {
    id: 'chatcmpl-fake',
    object: 'chat.completion.chunk',
    created: 0,
    model: 'fake',
    choices: [],
    usage: {
      prompt_tokens: usage.input + cacheRead + cacheWrite,
      completion_tokens: usage.output,
      total_tokens: usage.input + cacheRead + cacheWrite + usage.output,
      prompt_tokens_details: { cached_tokens: cacheRead, cache_write_tokens: cacheWrite },
    },
  };
}

function deltasOf(chunk: Exclude<FakeChunk, { wait: Promise<void> }>, toolIndex: number): Record<string, unknown>[] {
  if ('text' in chunk) return [{ content: chunk.text }];
  if ('thinking' in chunk) return [{ reasoning_content: chunk.thinking }];
  const call = chunk.toolCall;
  const pieces = 'arguments' in call ? [JSON.stringify(call.arguments)] : call.argumentPieces;
  return pieces.map((piece, position) => ({
    tool_calls: [{ index: toolIndex, ...(position === 0 ? { id: call.id, type: 'function' } : {}), function: { ...(position === 0 ? { name: call.name } : {}), arguments: piece } }],
  }));
}

async function stream(response: ServerResponse, request: FakeRequest, reply: Extract<FakeReply, { chunks: unknown }>): Promise<void> {
  const send = (event: unknown): void => {
    response.write(`data: ${JSON.stringify(event)}\n\n`);
  };
  response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  send(chunkEvent({ role: 'assistant', content: '' }, null));
  let toolIndex = 0;
  for (const chunk of reply.chunks) {
    if ('wait' in chunk) {
      await chunk.wait;
      if (request.state === 'aborted') return;
      continue;
    }
    for (const delta of deltasOf(chunk, toolIndex)) send(chunkEvent(delta, null));
    if ('toolCall' in chunk) toolIndex += 1;
  }
  send(chunkEvent({}, reply.finish ?? (toolIndex > 0 ? 'tool_calls' : 'stop')));
  if (reply.usage !== undefined) send(usageEvent(reply.usage));
  response.end('data: [DONE]\n\n');
}

function readBody(message: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let text = '';
    message.setEncoding('utf8');
    message.on('data', (piece: string) => (text += piece));
    message.on('end', () => resolve(text));
    message.on('error', reject);
  });
}

async function answer(message: IncomingMessage, response: ServerResponse, queued: FakeReply[], seen: FakeRequest[]): Promise<void> {
  if (message.method !== 'POST' || message.url !== '/v1/chat/completions') {
    response.writeHead(404, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { message: 'Not found.' } }));
    return;
  }
  const request: FakeRequest = { authorization: message.headers.authorization, body: JSON.parse(await readBody(message)), state: 'answering' };
  seen.push(request);
  response.on('close', () => {
    if (!response.writableFinished) request.state = 'aborted';
  });
  const reply = queued.shift();
  if (reply === undefined) {
    response.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify(noReply));
  } else if ('status' in reply) {
    response.writeHead(reply.status, { 'content-type': 'application/json' }).end(JSON.stringify(reply.body));
  } else {
    await stream(response, request, reply);
  }
  if (request.state === 'answering') request.state = 'answered';
}

/** Starts a fake OpenAI-compatible streaming server on 127.0.0.1 for LLM tests. */
export async function startFakeOpenAI(): Promise<FakeOpenAI> {
  const queued: FakeReply[] = [];
  const seen: FakeRequest[] = [];
  const server = createServer((message, response) => {
    answer(message, response, queued, seen).catch((error: unknown) => {
      response.destroy(error instanceof Error ? error : new Error(String(error)));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  return {
    baseUrl: `http://127.0.0.1:${String(port)}/v1`,
    reply: (...replies) => {
      queued.push(...replies);
    },
    requests: () => seen,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
