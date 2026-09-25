import { rmSync } from 'node:fs';
import { dirname } from 'node:path';
import type { OutboundSend, Problem, ReplyPayload } from '@kvman/protocol';
import fc from 'fast-check';
import { describe, it } from 'vitest';
import { temporaryDatabaseFile } from '../storage/harness.ts';
import { bootModelKernel, continuationType, crash, end, freeType, laneType, quiesce, submit, type ModelKernel } from './model-kernel.ts';
import { maxAttempts, Reference, valueOf, type Expected } from './model-reference.ts';

// ADR 0102: fast-check drives sends, endings, cancels, time, and crashes through the kernel's scheduling core, and
// the reference model checks the claims, states, replies, and continuations after every step.

type Real = { kernel: ModelKernel };
type ModelCommand = fc.AsyncCommand<Reference, Real>;

const lanes = ['L0', 'L1', 'L2'];

function problem(code: string, retryable: boolean, id: string): Problem {
  return { code, title: code, retryable, correlationId: id };
}

function sendOf(lane: number | null, withReply: boolean): OutboundSend {
  return {
    type: lane === null ? freeType : laneType, payload: lane === null ? {} : { lane: lanes[lane] ?? 'L0' },
    ...(withReply ? { onReply: { type: continuationType } } : {}),
  };
}

function pick<Item>(items: readonly Item[], index: number): Item | undefined {
  return items.length === 0 ? undefined : items[index % items.length];
}

class Send implements ModelCommand {
  readonly lane: number | null;
  constructor(lane: number | null) {
    this.lane = lane;
  }
  check(): boolean {
    return true;
  }
  async run(model: Reference, real: Real): Promise<void> {
    const id = await submit(real.kernel, this.lane === null ? freeType : laneType, this.lane === null ? {} : { lane: lanes[this.lane] ?? 'L0' });
    model.add(real.kernel, id, undefined);
    model.verify(real.kernel);
  }
  toString(): string {
    return `send(${String(this.lane)})`;
  }
}

type Ending = { how: 'ok' | 'retry' | 'fail' | 'defer' | 'send' | 'reply'; lane: number | null; withReply: boolean; other: number };

class End implements ModelCommand {
  readonly index: number;
  readonly ending: Ending;
  constructor(index: number, ending: Ending) {
    this.index = index;
    this.ending = ending;
  }
  check(model: Reference): boolean {
    return model.bySeq((message) => message.state === 'running').length > 0;
  }
  async run(model: Reference, real: Real): Promise<void> {
    model.observeClaims(real.kernel);
    const message = pick(model.bySeq((candidate) => candidate.state === 'running'), this.index);
    if (message === undefined) return;
    await this.#end(model, real.kernel, message);
    model.verify(real.kernel);
  }
  async #end(model: Reference, kernel: ModelKernel, message: Expected): Promise<void> {
    const { how, lane, withReply, other } = this.ending;
    const done: ReplyPayload = { ok: true, value: valueOf(message.id) };
    const awaiting = pick(model.bySeq((candidate) => candidate.state === 'awaiting'), other);
    if (how === 'retry') {
      await end(kernel, message.id, { ok: false, problem: problem('model/BUSY', true, message.id) });
      message.attempts += 1;
      if (message.attempts < maxAttempts) message.state = 'pending';
      else model.finish(kernel, message, 'dead', { ok: false, problem: problem('MESSAGE_DEAD', false, message.id) });
    } else if (how === 'fail') {
      const refused = problem('model/REFUSED', false, message.id);
      await end(kernel, message.id, { ok: false, problem: refused });
      model.finish(kernel, message, 'failed', { ok: false, problem: refused });
    } else if (how === 'defer') {
      await end(kernel, message.id, { deferred: true });
      message.state = 'awaiting';
    } else if (how === 'send') {
      await end(kernel, message.id, done, { sends: [sendOf(lane, withReply)] });
      model.finish(kernel, message, 'done', done);
      model.addByKey(kernel, `${message.id}:send:0`, message.id);
    } else if (how === 'reply' && awaiting !== undefined) {
      const released: ReplyPayload = { ok: true, value: { released: awaiting.id } };
      await end(kernel, message.id, done, { replies: [{ commandId: awaiting.id, payload: released }] });
      model.finish(kernel, awaiting, 'done', released);
      model.finish(kernel, message, 'done', done);
    } else {
      await end(kernel, message.id, done);
      model.finish(kernel, message, 'done', done);
    }
  }
  toString(): string {
    return `end(${String(this.index)}, ${JSON.stringify(this.ending)})`;
  }
}

class Cancel implements ModelCommand {
  readonly index: number;
  constructor(index: number) {
    this.index = index;
  }
  check(model: Reference): boolean {
    return model.messages.size > 0;
  }
  async run(model: Reference, real: Real): Promise<void> {
    model.observeClaims(real.kernel);
    const target = pick(model.bySeq(() => true), this.index);
    if (target === undefined) return;
    await submit(real.kernel, 'kernel.cancel', { messageId: target.id });
    const scope = new Set([target.id]);
    for (let grew = true; grew;) {
      const children = model.bySeq((message) => message.parent !== undefined && scope.has(message.parent) && !scope.has(message.id));
      for (const child of children) scope.add(child.id);
      grew = children.length > 0;
    }
    for (const message of model.bySeq((candidate) => scope.has(candidate.id) && ['pending', 'running', 'awaiting'].includes(candidate.state))) {
      model.finish(real.kernel, message, 'cancelled', { ok: false, problem: problem('CANCELLED', false, message.id) });
    }
    model.verify(real.kernel);
  }
  toString(): string {
    return `cancel(${String(this.index)})`;
  }
}

// Time moves only while nothing runs: a running invocation would pass its deadline, which is not this model's subject.
class Advance implements ModelCommand {
  check(model: Reference): boolean {
    return model.bySeq((message) => message.state === 'running').length === 0;
  }
  async run(model: Reference, real: Real): Promise<void> {
    real.kernel.timers.advance(60_000);
    await quiesce();
    model.verify(real.kernel);
  }
  toString(): string {
    return 'advance(60 s)';
  }
}

class Crash implements ModelCommand {
  check(): boolean {
    return true;
  }
  async run(model: Reference, real: Real): Promise<void> {
    model.observeClaims(real.kernel);
    real.kernel = await crash(real.kernel);
    await quiesce();
    model.crashed(real.kernel);
    model.verify(real.kernel);
  }
  toString(): string {
    return 'crash';
  }
}

const laneOrNone = fc.option(fc.integer({ min: 0, max: lanes.length - 1 }), { nil: null });

const ending = fc.record({
  how: fc.constantFrom('ok', 'retry', 'fail', 'defer', 'send', 'reply' as const),
  lane: laneOrNone, withReply: fc.boolean(), other: fc.nat(),
});

const commands = [
  laneOrNone.map((lane) => new Send(lane)),
  fc.tuple(fc.nat(), ending).map(([index, how]) => new End(index, how)),
  fc.nat().map((index) => new Cancel(index)),
  fc.constant(new Advance()),
  fc.constant(new Crash()),
];

describe('the model of lanes and replies (plan 14 §14.2, ADR 0102)', () => {
  it('M1.9-H12 the model test runs 1,000 sequences clean', async () => {
    await fc.assert(
      fc.asyncProperty(fc.commands(commands, { maxCommands: 30 }), async (sequence) => {
        const real: Real = { kernel: await bootModelKernel(temporaryDatabaseFile()) };
        try {
          await fc.asyncModelRun(() => ({ model: new Reference(), real }), sequence);
        } finally {
          real.kernel.scheduler.stop();
          real.kernel.connection.close();
          rmSync(dirname(real.kernel.file), { recursive: true, force: true });
        }
      }),
      { numRuns: 1000, seed: 1909 },
    );
  }, 600_000);
});
