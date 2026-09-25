import { sseMessageSchemas } from '@kvman/protocol';
import { z } from 'zod';
import { fixtureWorkspace } from '../test/child-kernel/workspace.ts';
import { expectStatus, keepAlive, openLiveStream, post, type LiveMessage } from './http-load.ts';
import { percentile, type Metrics } from './rules.ts';

// The four M1.9 benchmarks of ADR 0104, each against a fresh fixture kernel with the bench extension.

export type Benchmark = {
  name: string;
  prepare(port: number): Promise<void>;
  warmUp(port: number): Promise<void>;
  round(port: number, index: number): Promise<Metrics>;
};

const perRound = 500;
const sustainedClients = 64;
const sustainedMs = 5000;
const indexedDocuments = 10_000;
const seedBatch = 1000;

// The bench extension's chunks carry the time they were published.
const stampedChunk = z.object({ data: z.object({ at: z.number() }) });

let keys = 0;

function commandBody(payload: unknown): unknown {
  keys += 1;
  return { payload, idempotencyKey: `bench-${process.pid}-${keys}`, workspaceId: fixtureWorkspace, wait: 60_000 };
}

function latencies(values: readonly number[]): Metrics {
  return { p50Ms: percentile(values, 0.5), p99Ms: percentile(values, 0.99) };
}

async function roundTrips(port: number, count: number): Promise<number[]> {
  const agent = keepAlive(1);
  const measured: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const started = performance.now();
    await expectStatus(post(agent, port, '/api/v1/commands/bench.noop', commandBody({})), 200);
    measured.push(performance.now() - started);
  }
  agent.destroy();
  return measured;
}

async function sustained(port: number, durationMs: number): Promise<number> {
  const agent = keepAlive(sustainedClients);
  const started = performance.now();
  let replies = 0;
  const client = async (): Promise<void> => {
    while (performance.now() - started < durationMs) {
      await expectStatus(post(agent, port, '/api/v1/commands/bench.noop', commandBody({})), 200);
      replies += 1;
    }
  };
  await Promise.all(Array.from({ length: sustainedClients }, client));
  const elapsedMs = performance.now() - started;
  agent.destroy();
  return replies / (elapsedMs / 1000);
}

async function queries(port: number, count: number): Promise<number[]> {
  const agent = keepAlive(1);
  const measured: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const started = performance.now();
    const answer = await expectStatus(post(agent, port, '/api/v1/queries/bench.docs.find', { payload: { group: `g${index % 100}` }, workspaceId: fixtureWorkspace }), 200);
    measured.push(performance.now() - started);
    if (!answer.body.includes('"count":100')) throw new Error(`a group query found ${answer.body}`);
  }
  agent.destroy();
  return measured;
}

async function liveLatencies(port: number, key: string, count: number): Promise<number[]> {
  const received: number[] = [];
  let done: () => void = () => undefined;
  const all = new Promise<void>((resolve) => { done = resolve; });
  const stream = await openLiveStream(port, `bench-${key}`, ({ data, receivedAt }: LiveMessage) => {
    received.push(receivedAt - stampedChunk.parse(sseMessageSchemas.live.parse(data).chunk).data.at);
    if (received.length === count) done();
  });
  const agent = keepAlive(1);
  await expectStatus(post(agent, port, '/api/v1/subscriptions', { stream: `bench-${key}`, sid: key, live: [`bench.progress.streamed:${key}`], workspaceId: fixtureWorkspace }), 201);
  await expectStatus(post(agent, port, '/api/v1/commands/bench.stream', commandBody({ key, count })), 200);
  await all;
  stream.close();
  agent.destroy();
  return received;
}

export const benchmarks: Benchmark[] = [
  {
    name: 'command.round-trip',
    prepare: async () => undefined,
    warmUp: async (port) => void (await roundTrips(port, 100)),
    round: async (port) => latencies(await roundTrips(port, perRound)),
  },
  {
    name: 'command.sustained',
    prepare: async () => undefined,
    warmUp: async (port) => void (await sustained(port, 1000)),
    round: async (port) => ({ perSecond: await sustained(port, sustainedMs) }),
  },
  {
    name: 'query.indexed',
    prepare: async (port) => {
      const agent = keepAlive(1);
      for (let from = 0; from < indexedDocuments; from += seedBatch) {
        await expectStatus(post(agent, port, '/api/v1/commands/bench.docs.seed', commandBody({ from, count: seedBatch })), 200);
      }
      agent.destroy();
    },
    warmUp: async (port) => void (await queries(port, 100)),
    round: async (port) => latencies(await queries(port, perRound)),
  },
  {
    name: 'live.latency',
    prepare: async () => undefined,
    warmUp: async (port) => void (await liveLatencies(port, 'warm', 100)),
    round: async (port, index) => latencies(await liveLatencies(port, `round-${index}`, perRound)),
  },
];
