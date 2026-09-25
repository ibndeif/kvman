import { jsonByteLength, type Json } from '@kvman/protocol';
import type { Ctx, StepOptions } from '@kvman/sdk';
import { kernelProblem, ProblemError } from '../problems.ts';
import type { Connection } from '../storage/driver.ts';
import { inWriteTransaction } from '../storage/write-transaction.ts';

export const maxStepResultBytes = 256 * 1024;

export type StepStart = { status: 'recorded'; result: Json | undefined } | { status: 'run' };

export type StepRef = { messageId: string; name: string; correlationId: string };

// Where a handler's steps are journaled: the kernel's journal, or a host's calls to it (03 §3.5).
export interface StepRecorder {
  begin(step: StepRef, retrySafe: boolean): StepStart | Promise<StepStart>;
  record(step: StepRef, result: Json | undefined): void | Promise<void>;
}

// A step row is committed on its own before the effect runs, so a crash between begin and record leaves it
// `started` and the redelivered handler learns that the effect may have happened.
export class StepJournal implements StepRecorder {
  readonly #connection: Connection;
  readonly #now: () => number;

  constructor(connection: Connection, now: () => number) {
    this.#connection = connection;
    this.#now = now;
  }

  begin(step: StepRef, retrySafe: boolean): StepStart {
    const row = this.#connection.prepare('SELECT state, result FROM steps WHERE message_id = ? AND name = ?').get(step.messageId, step.name);
    if (row?.['state'] === 'done') {
      const stored = row['result'];
      return { status: 'recorded', result: stored === null || stored === undefined ? undefined : (JSON.parse(String(stored)) as Json) };
    }
    if (row !== undefined) {
      if (!retrySafe) {
        throw new ProblemError(kernelProblem('EFFECT_INDETERMINATE', {
          correlationId: step.correlationId, messageId: step.messageId, params: { step: step.name },
          hint: 'the step started in an earlier attempt and did not record its result; check the effect before retrying',
        }));
      }
      return { status: 'run' };
    }
    this.#inTransaction(() => this.#connection
      .prepare('INSERT INTO steps (message_id, name, state, retry_safe, started_at) VALUES (?, ?, ?, ?, ?)')
      .run(step.messageId, step.name, 'started', retrySafe ? 1 : 0, this.#now()));
    return { status: 'run' };
  }

  record(step: StepRef, result: Json | undefined): void {
    if (result !== undefined && jsonByteLength(result) > maxStepResultBytes) {
      throw new ProblemError(kernelProblem('PAYLOAD_TOO_LARGE', {
        correlationId: step.correlationId, messageId: step.messageId, params: { limit: 'step-result', max: maxStepResultBytes },
        hint: 'store large results as blobs and return the blob id',
      }));
    }
    this.#inTransaction(() => this.#connection
      .prepare('UPDATE steps SET state = ?, result = ?, finished_at = ? WHERE message_id = ? AND name = ?')
      .run('done', result === undefined ? null : JSON.stringify(result), this.#now(), step.messageId, step.name));
  }

  #inTransaction(write: () => void): void {
    inWriteTransaction(this.#connection, write);
  }
}

export type StepFunction = Ctx['step'];

export function createStepFunction(journal: StepRecorder, messageId: string, correlationId: string): StepFunction {
  const used = new Set<string>();
  return async <Result extends Json | undefined>(name: string, effect: () => Promise<Result>, options: StepOptions = {}) => {
    if (used.has(name)) {
      throw new ProblemError(kernelProblem('STEP_DUPLICATE', { correlationId, messageId, params: { step: name }, hint: 'give every step of a run its own name, e.g. include the loop index' }));
    }
    used.add(name);
    const step = { messageId, name, correlationId };
    const start = await journal.begin(step, options.retrySafe ?? false);
    if (start.status === 'recorded') return start.result as Result;
    const result = await effect();
    await journal.record(step, result);
    return result;
  };
}
