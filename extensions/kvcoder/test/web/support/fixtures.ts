import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import type { Component } from 'vue';
import type { Message, Session, Turn } from '../../../src/index.ts';
import type { ArtifactContent, ArtifactSummary } from '../../../web/src/use-artifacts.ts';
import type { Job } from '../../../web/src/use-jobs.ts';
import type { FakeKvman } from './fake-kvman.ts';

// Sessions, messages, and turns for component tests, and mounting a component with the fake `kvman`.

const usage = { input: 1200, output: 300, cacheRead: 0, cacheWrite: 0, cost: 0.02 };

export function session(fields: Partial<Session> = {}): Session {
  return { id: 's1', title: 'Notes page', status: 'idle', model: 'fake/m1', thinking: 'medium', usage, durationMs: 48_000, createdAt: '2026-10-01T09:00:00.000Z', updatedAt: '2026-10-01T09:00:00.000Z', ...fields };
}

let seq = 0;

export function message(kind: Message['kind'], content: Message['content'], fields: Partial<Message> = {}): Message {
  seq += 1;
  return { id: `m${seq}`, sessionId: 's1', seq, kind, content, createdAt: '2026-10-01T09:00:00.000Z', ...fields };
}

export const user = (text: string, fields: Partial<Message> = {}): Message => message('user', { role: 'user', content: text, timestamp: 1 }, fields);

export const answer = (text: string, fields: Partial<Message> = {}): Message => message('assistant', { role: 'assistant', content: [{ type: 'text', text }] }, fields);

export function turn(fields: Partial<Turn> = {}): Turn {
  return { id: 't1', sessionId: 's1', startedAt: '2026-10-01T09:00:00.000Z', durationMs: 12_000, steps: 1, usage, pending: [], ...fields };
}

export type World = { found: Session; messages: Message[]; omitted: number; turns: Turn[]; jobs?: Job[]; artifacts?: ArtifactSummary[]; artifactContents?: Record<string, ArtifactContent> };

export function job(fields: Partial<Job> = {}): Job {
  return { id: 'j1', kind: 'process', title: 'Start the dev server', call: 'python3 -m http.server 8000', status: 'running', startedAt: '2026-10-01T09:00:00.000Z', links: [], ...fields };
}

export function artifactSummary(fields: Partial<ArtifactSummary> = {}): ArtifactSummary {
  return { id: 'plan', title: 'The plan', format: 'markdown', version: 1, size: 18, updatedAt: '2026-10-01T09:01:00.000Z', ...fields };
}

export function artifactContent(fields: Partial<ArtifactContent> = {}): ArtifactContent {
  return { id: 'plan', title: 'The plan', format: 'markdown', version: 1, content: '# The plan', createdAt: '2026-10-01T09:00:30.000Z', updatedAt: '2026-10-01T09:01:00.000Z', ...fields };
}

/** A tool result of an artifact write or edit, carrying the card's details (ADR 0009, 177). */
export function artifactResult(fields: { id?: string; title?: string; format?: 'markdown' | 'html'; version?: number } = {}): Message {
  const { id = 'plan', title = 'The plan', format = 'markdown', version = 1 } = fields;
  return message('toolResult', { role: 'toolResult', toolCallId: 'c1', toolName: 'bash', content: [{ type: 'text', text: `{"id":"${id}","version":${version}}` }], isError: false, details: { artifact: { id, title, format, version } } });
}

/** Answers the conversation's reads from `world`, which a test may change between reads. */
export function serve(fake: FakeKvman, world: World): void {
  fake.handle('kvcoder.session.get', (input) => (input['sessionId'] === world.found.id ? world.found : session({ id: String(input['sessionId']), parentId: 's1', title: 'Helper task', status: 'running' })));
  fake.handle('kvcoder.message.list', () => ({ messages: world.messages, omitted: world.omitted }));
  fake.handle('kvcoder.turn.list', () => world.turns);
  fake.handle('kvcoder.job.list', () => world.jobs ?? []);
  fake.handle('kvcoder.artifact.list', () => world.artifacts ?? []);
  fake.handle('kvcoder.artifact.get', (input) => {
    const found = (world.artifactContents ?? {})[String(input['id'])];
    if (found === undefined) throw Object.assign(new Error(`Unknown artifact ${String(input['id'])}`), { problem: { code: 'NOT_FOUND', message: 'Unknown artifact.', params: {} } });
    return found;
  });
  fake.handle('kvai.provider.list', () => [{ id: 'fake', title: 'Fake', status: 'noKey' }]);
  fake.handle('kvai.model.list', () => [{ id: 'fake/m1', name: 'M1', provider: 'fake' }, { id: 'fake/m2', name: 'M2', provider: 'fake' }]);
}

export async function mounted(component: Component, fake: FakeKvman, props: Record<string, unknown> = {}): Promise<VueWrapper> {
  const wrapper = mount(component, { props, global: { provide: { kvman: fake.kvman } } });
  await flushPromises();
  return wrapper;
}
