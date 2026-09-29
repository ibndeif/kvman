import type { HostThread, StartHostThread } from '@kvman/kernel';
import { completeFrameSchema, loadFailedFrameSchema, rpcFrameSchema, type KernelToHostFrame } from '@kvman/protocol';
import { TestkitError } from './testkit-errors.ts';

/** Where `crashDuring` stops the kernel: `before-step:<name>`, `after-step:<name>`, or `before-commit` (ADR 0166). */
export type CrashPoint = `before-step:${string}` | `after-step:${string}` | 'before-commit';

type ParsedPoint = { kind: 'before-step' | 'after-step'; step: string } | { kind: 'before-commit' };

// One armed crash: the message is known by its idempotency key before any host sees it.
type Armed = { idempotencyKey: string; point: ParsedPoint; invocationId?: string; stepEndCall?: number; crash(): void; missed(): void };

export function parsedPoint(point: string): ParsedPoint {
  if (point === 'before-commit') return { kind: 'before-commit' };
  const match = /^(before-step|after-step):(.+)$/.exec(point);
  if (match?.[1] === 'before-step' || match?.[1] === 'after-step') return { kind: match[1], step: match[2] ?? '' };
  throw new TestkitError(`"${point}" is not a crash point: use before-step:<name>, after-step:<name>, or before-commit`);
}

// ADR 0166: the host frames of the armed message's invocation are watched between the kernel and its hosts. The
// frame at the point is dropped, so what it would have caused never happens, and the kernel is stopped.
export class CrashPoints {
  #armed: Armed | undefined;

  arm(armed: Armed): void {
    this.#armed = armed;
  }

  disarm(): void {
    this.#armed = undefined;
  }

  wrap(start: StartHostThread): StartHostThread {
    return (events) => {
      const thread: HostThread = start({ ...events, frame: (value) => {
        if (!this.#fromHost(value)) events.frame(value);
      } });
      return {
        identity: thread.identity,
        post: (frame) => {
          if (!this.#toHost(frame)) thread.post(frame);
        },
        ...(thread.postValue === undefined ? {} : { postValue: thread.postValue.bind(thread) }),
        terminate: () => thread.terminate(),
      };
    };
  }

  #trigger(armed: Armed): true {
    this.#armed = undefined;
    armed.crash();
    return true;
  }

  // True when the frame is dropped.
  #fromHost(value: unknown): boolean {
    const armed = this.#armed;
    if (armed?.invocationId === undefined) return false;
    const { point } = armed;
    const rpc = rpcFrameSchema.safeParse(value);
    if (rpc.success && rpc.data.invocationId === armed.invocationId && point.kind !== 'before-commit') {
      const { call } = rpc.data;
      if (call.name === 'step.begin' && point.kind === 'before-step' && call.step === point.step) return this.#trigger(armed);
      if (call.name === 'step.end' && point.kind === 'after-step' && call.step === point.step) armed.stepEndCall = rpc.data.callId;
      return false;
    }
    const ended = completeFrameSchema.safeParse(value);
    const failed = ended.success ? undefined : loadFailedFrameSchema.safeParse(value);
    const invocationId = ended.success ? ended.data.invocationId : failed?.success === true ? failed.data.invocationId : undefined;
    if (invocationId !== armed.invocationId) return false;
    if (ended.success && point.kind === 'before-commit') return this.#trigger(armed);
    this.#armed = undefined;
    armed.missed();
    return false;
  }

  #toHost(frame: KernelToHostFrame): boolean {
    const armed = this.#armed;
    if (armed === undefined) return false;
    if (frame.frame === 'invoke') {
      if (frame.message.idempotencyKey === armed.idempotencyKey) armed.invocationId = frame.invocationId;
      return false;
    }
    const answersStepEnd = frame.frame === 'rpcResult' && frame.invocationId === armed.invocationId && frame.callId === armed.stepEndCall;
    return answersStepEnd ? this.#trigger(armed) : false;
  }
}
