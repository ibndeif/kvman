import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Address, Message, OutboundSend } from '@kvman/protocol';
import {
  betterSqlite3Driver, CommitPipeline, createUlidGenerator, kernelProblem, openKernelDatabase, StorageFailure,
  type Admission, type AdmissionRequest, type AdmissionResult, type CommitUnit, type Connection, type PreparedStatement,
  type SqlRow, type StorageDriver, type StorageFailureKind,
} from '../../src/index.ts';

export const workspaceId = 'a'.repeat(64);
export const now = (): number => 1_790_000_000_000;
export const ulids = createUlidGenerator(() => Date.now());

export function temporaryDatabaseFile(): string {
  return path.join(mkdtempSync(path.join(tmpdir(), 'kvman-storage-')), 'kvman.db');
}

export type Fault = { sql: RegExp; kind: StorageFailureKind; armed: boolean };

export type RecordingDriver = StorageDriver & { transactions: number; faults: Fault[] };

function failIfArmed(driver: RecordingDriver, sql: string): void {
  const fault = driver.faults.find((candidate) => candidate.armed && candidate.sql.test(sql));
  if (fault !== undefined) throw new StorageFailure(fault.kind, `injected failure on ${sql.slice(0, 40)}`);
}

export function recordingDriver(): RecordingDriver {
  const driver: RecordingDriver = {
    transactions: 0,
    faults: [],
    open(file, options) {
      const connection = betterSqlite3Driver.open(file, options);
      const wrapped: Connection = {
        exec(sql) {
          if (sql.startsWith('BEGIN')) driver.transactions += 1;
          failIfArmed(driver, sql);
          connection.exec(sql);
        },
        prepare(sql) {
          const statement = connection.prepare(sql);
          const guarded: PreparedStatement = {
            run: (...values) => { failIfArmed(driver, sql); return statement.run(...values); },
            get: (...values) => statement.get(...values),
            all: (...values) => statement.all(...values),
          };
          return guarded;
        },
        pragma: (text) => connection.pragma(text),
        inTransaction: () => connection.inTransaction(),
        close: () => connection.close(),
      };
      return wrapped;
    },
  };
  return driver;
}

export type TestAdmissionOptions = { owners: Record<string, string>; invalidField?: string };

function messageFor(request: AdmissionRequest): Message {
  const { send, sender, cause, correlationId } = request;
  return {
    v: 1, id: ulids.next(), kind: 'command', type: send.type, source: sender, workspaceId: cause?.workspaceId ?? workspaceId,
    ...(send.lane === undefined ? {} : { lane: send.lane }), payload: send.payload, correlationId,
    ...(cause === undefined ? {} : { causationId: cause.id }), context: { locale: 'en', ...send.context },
    ...(send.onReply === undefined ? {} : { onReply: send.onReply }),
    ...(send.idempotencyKey === undefined ? {} : { idempotencyKey: send.idempotencyKey }),
    priority: send.priority ?? cause?.priority ?? 'interactive', createdAt: now(),
  };
}

export function testAdmission(options: TestAdmissionOptions): Admission {
  return {
    admit(request): AdmissionResult {
      const message = messageFor(request);
      const owner = options.owners[request.send.type];
      if (owner === undefined) {
        return { ok: false, problem: kernelProblem('TYPE_NOT_FOUND', { correlationId: request.correlationId, params: { type: request.send.type } }), admitted: { message, handler: '' } };
      }
      const payload = request.send.payload;
      if (options.invalidField !== undefined && payload !== null && typeof payload === 'object' && !Array.isArray(payload) && options.invalidField in payload) {
        return { ok: false, problem: kernelProblem('VALIDATION_FAILED', { correlationId: request.correlationId }), admitted: { message, handler: owner } };
      }
      return { ok: true, admitted: { message, handler: owner } };
    },
  };
}

export type TestStore = { connection: Connection; pipeline: CommitPipeline; driver: RecordingDriver; file: string };

export function openTestStore(owners: Record<string, string> = {}, invalidField?: string): TestStore {
  const file = temporaryDatabaseFile();
  const driver = recordingDriver();
  const connection = openKernelDatabase(file, driver, ulids.next());
  const admission = testAdmission(invalidField === undefined ? { owners } : { owners, invalidField });
  return { connection, pipeline: new CommitPipeline({ connection, admission, now }), driver, file };
}

export function adapterUnit(sends: OutboundSend[], sender: Address = 'user:local'): CommitUnit {
  return { origin: { kind: 'adapter', sender, correlationId: ulids.next() }, writes: [], sends };
}

export async function invocationMessage(store: TestStore, type = 'pdf.translate'): Promise<Message> {
  const result = await store.pipeline.enqueue(adapterUnit([{ type, payload: {} }]));
  if (!result.committed || result.inserted[0] === undefined) throw new Error('the invocation message was not stored');
  return result.inserted[0].message;
}

export function rows(connection: Connection, sql: string, ...values: (string | number)[]): SqlRow[] {
  return connection.prepare(sql).all(...values);
}
