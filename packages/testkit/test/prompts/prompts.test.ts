import type { Json, Problem } from '@kvman/protocol';
import { createTestKernel, TestkitProblem, type TestKernel, type TestKernelOptions } from '../../src/index.ts';
import { afterEach, describe, expect, it, vi } from 'vitest';

const asker = new URL('./fixtures/extensions/asker/extension.ts', import.meta.url);

const unknownId = '01JAZ3K4M5N6P7Q8R9S0T1V2W3';
const subscriptionHandler = '@acme/asker|subscription:asker.question.asked';

const kernels: TestKernel[] = [];

afterEach(async () => {
  while (kernels.length > 0) await kernels.pop()?.close();
});

async function started(options: TestKernelOptions): Promise<TestKernel> {
  const kernel = await createTestKernel(options);
  kernels.push(kernel);
  return kernel;
}

function problemOf(error: unknown): Problem {
  if (error instanceof TestkitProblem) return error.problem;
  throw new Error(`expected a TestkitProblem, got ${String(error)}`);
}

function field(value: Json, name: string): Json {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const found = value[name];
    if (found !== undefined) return found;
  }
  throw new Error(`expected ${name} in the reply`);
}

function itemsOf(value: Json): Json[] {
  if (Array.isArray(value)) return value;
  throw new Error('expected an array in the reply');
}

function textOf(value: Json, name: string): string {
  const found = field(value, name);
  if (typeof found === 'string') return found;
  throw new Error(`expected ${name} to be a string`);
}

function issuePaths(problem: Problem): string[] {
  return (problem.issues ?? []).map((issue) => issue.path);
}

function latestId(events: Array<{ payload: Json }>, name: string): string {
  const latest = events[events.length - 1];
  if (latest === undefined) throw new Error('expected an event');
  return textOf(latest.payload, name);
}

function topicsOf(items: Json[]): string[] {
  return items.map((item) => textOf(field(item, 'data'), 'topic'));
}

// A question is asker.ask sent by the driver; its id is the asked event's questionId, the command's message id.
async function openQuestion(k: TestKernel, topic: string): Promise<{ answer: Promise<Json>; questionId: string }> {
  const before = k.events('asker.question.asked').length;
  const answer = k.command('asker.ask', { topic, text: 'Ship it?' });
  await vi.waitFor(() => expect(k.events('asker.question.asked')).toHaveLength(before + 1), { timeout: 10_000 });
  return { answer, questionId: latestId(k.events('asker.question.asked'), 'questionId') };
}

async function messageWithId(k: TestKernel, type: string, id: string): Promise<Json> {
  const listing = await k.asUser().query('kernel.messages.list', { type });
  const found = itemsOf(field(listing, 'items')).find((item) => {
    if (typeof item === 'object' && item !== null && !Array.isArray(item)) return item['id'] === id;
    return false;
  });
  if (found === undefined) throw new Error(`expected a message ${id} of type ${type}`);
  return found;
}

async function askedSubscription(k: TestKernel): Promise<Json> {
  const listing = await k.asUser().query('kernel.messages.list', { type: 'asker.question.asked' });
  const found = itemsOf(field(listing, 'items')).find((item) => {
    if (typeof item === 'object' && item !== null && !Array.isArray(item)) return item['handler'] === subscriptionHandler;
    return false;
  });
  if (found === undefined) throw new Error('expected a subscription delivery of asker.question.asked');
  return found;
}

describe('prompts: behavior (ADR 0167)', { timeout: 60_000 }, () => {
  it('M2.13-E37 an asked question waits with its open key and data', async () => {
    const k = await started({ extensions: [asker] });
    const { answer, questionId } = await openQuestion(k, 't1');
    expect(field(await messageWithId(k, 'asker.ask', questionId), 'state')).toBe('awaiting');
    const items = itemsOf(field(await k.query('asker.questions.list', {}), 'items'));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: questionId, status: 'open', data: { topic: 't1', text: 'Ship it?' }, openKey: 'topic:t1' });
    expect(typeof field(items[0] ?? {}, 'openedAt')).toBe('number');
    expect(k.events('asker.question.asked').map((event) => event.payload)).toEqual([{ questionId }]);
    expect(await k.asUser().command('asker.question.answer', { questionId, answer: 'Yes' })).toEqual({});
    expect(await answer).toEqual({ answer: 'Yes' });
  });

  it('M2.13-E38 a second question on the same topic is busy and stores nothing', async () => {
    const k = await started({ extensions: [asker] });
    const first = await openQuestion(k, 't1');
    const busy = await k.command('asker.ask', { topic: 't1', text: 'Ship it again?' }).catch((error: unknown) => error);
    expect(problemOf(busy)).toMatchObject({ code: 'asker/BUSY', params: { key: 'topic:t1' } });
    expect(itemsOf(field(await k.query('asker.questions.list', {}), 'items'))).toHaveLength(1);
    const second = await openQuestion(k, 't2');
    expect(k.events('asker.question.asked')).toHaveLength(2);
    expect(await k.asUser().command('asker.question.answer', { questionId: first.questionId, answer: 'Yes' })).toEqual({});
    expect(await first.answer).toEqual({ answer: 'Yes' });
    expect(await k.asUser().command('asker.question.answer', { questionId: second.questionId, answer: 'No' })).toEqual({});
    expect(await second.answer).toEqual({ answer: 'No' });
  });

  it('M2.13-E39 the person rejects an open question and the topic opens again', async () => {
    const k = await started({ extensions: [asker] });
    const { answer, questionId } = await openQuestion(k, 't1');
    expect(await k.asUser().command('asker.question.reject', { questionId })).toEqual({});
    expect(await answer).toEqual({ rejected: true });
    const items = itemsOf(field(await k.query('asker.questions.list', {}), 'items'));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: questionId, status: 'rejected' });
    const stored = items[0] ?? {};
    const closedAt = field(stored, 'closedAt');
    const openedAt = field(stored, 'openedAt');
    if (typeof closedAt !== 'number' || typeof openedAt !== 'number') throw new Error('expected timestamps');
    expect(closedAt).toBeGreaterThanOrEqual(openedAt);
    expect(k.events('asker.question.closed').map((event) => event.payload)).toEqual([{ questionId, status: 'rejected' }]);
    expect(await k.query('asker.state.get', {})).toEqual({ closed: [{ questionId, status: 'rejected' }] });
    const reopened = await openQuestion(k, 't1');
    expect(k.events('asker.question.asked')).toHaveLength(2);
    expect(await k.asUser().command('asker.question.answer', { questionId: reopened.questionId, answer: 'Yes' })).toEqual({});
    expect(await reopened.answer).toEqual({ answer: 'Yes' });
  });

  it('M2.13-E40 answering twice and answering an unknown id both fail without changing the answer', async () => {
    const k = await started({ extensions: [asker] });
    const { answer, questionId } = await openQuestion(k, 't1');
    expect(await k.asUser().command('asker.question.answer', { questionId, answer: 'Yes' })).toEqual({});
    expect(await answer).toEqual({ answer: 'Yes' });
    const repeated = await k.asUser().command('asker.question.answer', { questionId, answer: 'No' }).catch((error: unknown) => error);
    expect(problemOf(repeated).code).toBe('REPLY_NOT_AWAITING');
    const unknown = await k.asUser().command('asker.question.answer', { questionId: unknownId, answer: 'No' }).catch((error: unknown) => error);
    expect(problemOf(unknown).code).toBe('REPLY_NOT_AWAITING');
    expect(await k.query('asker.questions.list', {})).toMatchObject({ items: [{ id: questionId, status: 'answered', answer: { answer: 'Yes' } }] });
    expect(k.events('asker.question.closed')).toHaveLength(1);
  });

  it('M2.13-E41 an empty answer and an extension reject both fail and leave the question open', async () => {
    const k = await started({ extensions: [asker] });
    const { answer, questionId } = await openQuestion(k, 't1');
    const empty = await k.asUser().command('asker.question.answer', { questionId, answer: '' }).catch((error: unknown) => error);
    const emptyProblem = problemOf(empty);
    expect(emptyProblem.code).toBe('VALIDATION_FAILED');
    expect(issuePaths(emptyProblem)).toContain('payload.answer');
    const refused = await k.command('asker.question.reject', { questionId }).catch((error: unknown) => error);
    expect(problemOf(refused).code).toBe('CAPABILITY_DENIED');
    expect(await k.query('asker.questions.list', {})).toMatchObject({ items: [{ id: questionId, status: 'open' }] });
    expect(await k.asUser().command('asker.question.answer', { questionId, answer: 'Yes' })).toEqual({});
    expect(await answer).toEqual({ answer: 'Yes' });
  });

  it('M2.13-E42 a question past its deadline expires after the kernel sends its expire', async () => {
    const k = await started({ extensions: [asker] });
    expect(await k.command('asker.ask-soon', { topic: 't1', text: 'Ship it?' })).toEqual({});
    await vi.waitFor(() => expect(k.events('asker.question.asked')).toHaveLength(1), { timeout: 10_000 });
    const questionId = latestId(k.events('asker.question.asked'), 'questionId');
    await vi.waitFor(() => expect(k.events('asker.question.closed')).toHaveLength(1), { timeout: 15_000 });
    expect(await messageWithId(k, 'asker.ask', questionId)).toMatchObject({ state: 'failed', attempts: 0 });
    const expires = itemsOf(field(await k.asUser().query('kernel.messages.list', { type: 'asker.question.expire' }), 'items'));
    expect(expires).toHaveLength(1);
    expect(expires[0]).toMatchObject({ state: 'done' });
    expect(await k.query('asker.questions.list', {})).toMatchObject({ items: [{ id: questionId, status: 'expired' }] });
    expect(k.events('asker.question.closed').map((event) => event.payload)).toEqual([{ questionId, status: 'expired' }]);
  });

  it('M2.13-E43 cancelling an open question expires it and a later answer fails', async () => {
    const k = await started({ extensions: [asker] });
    const { answer, questionId } = await openQuestion(k, 't1');
    const settled = answer.catch((error: unknown) => error);
    await vi.waitFor(async () => {
      expect(field(await askedSubscription(k), 'state')).toBe('done');
    }, { timeout: 10_000 });
    expect(await k.asUser().command('kernel.cancel', { messageId: questionId })).toEqual({ cancelled: 1 });
    await vi.waitFor(() => expect(k.events('asker.question.closed')).toHaveLength(1), { timeout: 10_000 });
    expect(await k.query('asker.questions.list', {})).toMatchObject({ items: [{ id: questionId, status: 'expired' }] });
    expect(await messageWithId(k, 'asker.ask', questionId)).toMatchObject({ state: 'cancelled' });
    const late = await k.asUser().command('asker.question.answer', { questionId, answer: 'Yes' }).catch((error: unknown) => error);
    expect(problemOf(late).code).toBe('REPLY_NOT_AWAITING');
    expect(problemOf(await settled).code).toBe('CANCELLED');
  });

  it('M2.13-E44 expiring an answered question changes nothing', async () => {
    const k = await started({ extensions: [asker] });
    const { answer, questionId } = await openQuestion(k, 't1');
    expect(await k.asUser().command('asker.question.answer', { questionId, answer: 'Yes' })).toEqual({});
    expect(await answer).toEqual({ answer: 'Yes' });
    expect(await k.command('asker.expire-now', { commandId: questionId })).toEqual({});
    await vi.waitFor(async () => {
      const expires = itemsOf(field(await k.asUser().query('kernel.messages.list', { type: 'asker.question.expire' }), 'items'));
      expect(expires).toHaveLength(1);
      expect(field(expires[0] ?? {}, 'state')).toBe('done');
    }, { timeout: 10_000 });
    expect(await k.query('asker.questions.list', {})).toMatchObject({ items: [{ id: questionId, status: 'answered', answer: { answer: 'Yes' } }] });
    expect(k.events('asker.question.closed')).toHaveLength(1);
  });

  it('M2.13-E45 the question list filters by status, topic, and limit, and never holds tool calls', async () => {
    const k = await started({ extensions: [asker] });
    const first = await openQuestion(k, 't1');
    expect(await k.asUser().command('asker.question.answer', { questionId: first.questionId, answer: 'Yes' })).toEqual({});
    expect(await first.answer).toEqual({ answer: 'Yes' });
    const second = await openQuestion(k, 't2');
    const third = await openQuestion(k, 't3');
    const before = k.events('asker.tool-call.asked').length;
    const review = k.command('asker.review', { call: 'c1' });
    await vi.waitFor(() => expect(k.events('asker.tool-call.asked')).toHaveLength(before + 1), { timeout: 10_000 });
    const toolCallId = latestId(k.events('asker.tool-call.asked'), 'toolCallId');
    expect(topicsOf(itemsOf(field(await k.query('asker.questions.list', { status: 'open' }), 'items')))).toEqual(['t2', 't3']);
    expect(topicsOf(itemsOf(field(await k.query('asker.questions.list', { topic: 't2' }), 'items')))).toEqual(['t2']);
    expect(topicsOf(itemsOf(field(await k.query('asker.questions.list', { limit: 1 }), 'items')))).toEqual(['t1']);
    const tooMany = await k.query('asker.questions.list', { limit: 101 }).catch((error: unknown) => error);
    const tooManyProblem = problemOf(tooMany);
    expect(tooManyProblem.code).toBe('VALIDATION_FAILED');
    expect(issuePaths(tooManyProblem)).toContain('payload.limit');
    expect(topicsOf(itemsOf(field(await k.query('asker.questions.list', {}), 'items')))).toEqual(['t1', 't2', 't3']);
    expect(await k.query('asker.tool-calls.list', {})).toMatchObject({ items: [{ id: toolCallId, status: 'open', data: { call: 'c1' } }] });
    expect(await k.asUser().command('asker.question.answer', { questionId: second.questionId, answer: 'Yes' })).toEqual({});
    expect(await second.answer).toEqual({ answer: 'Yes' });
    expect(await k.asUser().command('asker.question.answer', { questionId: third.questionId, answer: 'Yes' })).toEqual({});
    expect(await third.answer).toEqual({ answer: 'Yes' });
    expect(await k.asUser().command('asker.tool-call.answer', { toolCallId, allow: true })).toEqual({});
    expect(await review).toEqual({ allow: true });
  });

  it('M2.13-E46 opening from an event subscription fails without storing a second question', async () => {
    const k = await started({ extensions: [asker] });
    const { answer, questionId } = await openQuestion(k, 'late');
    await vi.waitFor(async () => {
      expect(field(await askedSubscription(k), 'state')).toBe('failed');
    }, { timeout: 10_000 });
    expect(await askedSubscription(k)).toMatchObject({ state: 'failed', attempts: 0 });
    expect(itemsOf(field(await k.query('asker.questions.list', {}), 'items'))).toHaveLength(1);
    expect(await k.asUser().command('asker.question.answer', { questionId, answer: 'Yes' })).toEqual({});
    expect(await answer).toEqual({ answer: 'Yes' });
  });

  it('M2.13-E47 a question with a bad topic fails input validation before opening', async () => {
    const k = await started({ extensions: [asker] });
    const bad = await k.command('asker.ask', { topic: 7, text: 'Ship it?' }).catch((error: unknown) => error);
    const badProblem = problemOf(bad);
    expect(badProblem.code).toBe('VALIDATION_FAILED');
    expect(issuePaths(badProblem)).toContain('payload.topic');
    expect(itemsOf(field(await k.query('asker.questions.list', {}), 'items'))).toHaveLength(0);
    expect(k.events('asker.question.asked')).toHaveLength(0);
  });
});
