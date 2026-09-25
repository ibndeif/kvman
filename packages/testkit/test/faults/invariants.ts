import type { Connection } from '@kvman/kernel';
import type { MessageStatus } from '@kvman/protocol';
import { expect } from 'vitest';
import { accountOf, balanceOf, countOf, messageOf, messagesOf, postings, steps } from './ledger-database.ts';
import { accounts, postsPerAccount, type LedgerClient } from './ledger-workload.ts';

// The invariants of 14 §14.3 that M1 reaches (ADR 0100), over the ledger workload once everything settled.

const finalStates = ['done', 'failed', 'dead', 'cancelled'];

const ledgerCommands = ['ledger.post', 'ledger.audit.record', 'ledger.transfer', 'ledger.charge', 'ledger.refund', 'ledger.hold', 'ledger.release', 'ledger.stream'];

// (1) No committed storage effect is lost or applied twice.
function effectsOnce(connection: Connection): void {
  const done = messagesOf(connection, 'ledger.post').filter((post) => post.state === 'done');
  const entries = postings(connection);
  for (const account of [...accounts, 't']) {
    const posted = done.filter((post) => accountOf(post) === account).length;
    expect(balanceOf(connection, account), `balance of ${account}`).toBe(posted);
    expect(entries.filter((entry) => entry.account === account), `postings of ${account}`).toHaveLength(posted);
  }
  expect(entries.map((entry) => entry.messageId).sort()).toEqual(done.map((post) => post.id).sort());
}

// (2) Every command ends in exactly one final state with its one stored reply, which is what its client was told.
function oneFinalReply(connection: Connection, client: LedgerClient, statuses: ReadonlyMap<string, MessageStatus>): void {
  for (const type of ledgerCommands) {
    for (const row of messagesOf(connection, type)) {
      expect(finalStates, `${type} ${row.id}`).toContain(row.state);
      expect(row.result, `${type} ${row.id} reply`).toBeDefined();
    }
  }
  for (const { key, id, answer } of client.submitted.values()) {
    const row = messageOf(connection, id);
    const status = statuses.get(key);
    expect(status?.state, key).toBe(row.state);
    if (row.result?.ok === true) {
      expect(status?.reply, key).toEqual(row.result.value);
      if (answer.status === 200) expect(answer.json, key).toEqual({ id, reply: row.result.value });
    } else {
      expect(status?.problem?.code, key).toBe(row.result?.problem.code);
    }
  }
}

// (3) No message a handler emitted is duplicated: its derived idempotency key stores it once.
function emittedOnce(connection: Connection, client: LedgerClient): void {
  const done = messagesOf(connection, 'ledger.post').filter((post) => post.state === 'done');
  const audits = messagesOf(connection, 'ledger.audit.record');
  expect(audits.map((audit) => audit.idempotencyKey).sort()).toEqual(done.map((post) => `${post.id}:send:0`).sort());
  expect(countOf(connection, "SELECT count(*) AS count FROM events WHERE type = 'ledger.posted'")).toBe(done.length);
  const transfer = client.submitted.get('transfer');
  if (transfer !== undefined) {
    const called = messagesOf(connection, 'ledger.post').filter((post) => post.idempotencyKey === `${transfer.id}:command:1`);
    expect(called).toHaveLength(1);
  }
}

// (4) Lane order is preserved for completed messages.
function laneOrder(connection: Connection): void {
  const posts = messagesOf(connection, 'ledger.post');
  const entries = postings(connection);
  const expected = Array.from({ length: postsPerAccount }, (_, index) => index + 1);
  for (const account of accounts) {
    expect(entries.filter((entry) => entry.account === account).map((entry) => entry.n), `postings of ${account}`).toEqual(expected);
    const numbers = posts.filter((post) => accountOf(post) === account).map((post) => postings(connection).find((entry) => entry.messageId === post.id)?.n);
    expect(numbers, `posts of ${account} by seq`).toEqual(expected);
  }
}

// (6) A step that started without recording surfaces EFFECT_INDETERMINATE unless it is retry-safe.
function indeterminateSteps(connection: Connection): void {
  for (const step of steps(connection)) {
    const message = messageOf(connection, step.messageId);
    if (step.state === 'started') {
      expect(step.retrySafe, `${step.name} is retry-safe but stayed started`).toBe(false);
      expect(message.result).toMatchObject({ ok: false, problem: { code: 'EFFECT_INDETERMINATE', params: { step: step.name } } });
    }
    if (message.state === 'done') expect(step.state, `${step.name} of a done message`).toBe('done');
  }
}

export function checkInvariants(connection: Connection, client: LedgerClient, statuses: ReadonlyMap<string, MessageStatus>): void {
  effectsOnce(connection);
  oneFinalReply(connection, client, statuses);
  emittedOnce(connection, client);
  laneOrder(connection);
  indeterminateSteps(connection);
}

// Between a crash and the restart: a unit is in the file whole or not at all, so every done post has all its
// effects and no other post has any.
export function committedWhole(connection: Connection): void {
  const posts = messagesOf(connection, 'ledger.post');
  const done = posts.filter((post) => post.state === 'done').map((post) => post.id).sort();
  expect(postings(connection).map((entry) => entry.messageId).sort()).toEqual(done);
  expect(messagesOf(connection, 'ledger.audit.record').map((audit) => audit.idempotencyKey).sort()).toEqual(done.map((id) => `${id}:send:0`).sort());
  expect(countOf(connection, "SELECT count(*) AS count FROM events WHERE type = 'ledger.posted'")).toBe(done.length);
}
