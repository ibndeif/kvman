import type { CompleteFrame, Problem, QuarantineReason, RpcCall, RpcResult } from '@kvman/protocol';
import type { Claim } from '../scheduler/dispatcher.ts';
import type { ActiveInvocation } from './active-invocation.ts';

// The calls the RPC service answers; the host manager serves store reads itself (ADR 0131).
export type ServiceCall = Exclude<RpcCall, { name: 'store.read' }>;

// Where host events go: the RPC service, the settlement of invocations, quarantine, and the kernel host.
export interface InvocationSink {
  called(invocation: ActiveInvocation, call: ServiceCall): Promise<RpcResult>;
  completed(invocation: ActiveInvocation, frame: CompleteFrame): Promise<void>;
  loadFailed(invocation: ActiveInvocation, problem: Problem): Promise<void>;
  lost(invocation: ActiveInvocation): Promise<void>;
  refused(claim: Claim, problem: Problem): Promise<void>;
  timedOut(invocation: ActiveInvocation, reason: 'deadline' | 'timeout'): Promise<void>;
  aborted(invocation: ActiveInvocation): Promise<void>;
  collateral(invocation: ActiveInvocation): Promise<void>;
  interrupted(run: Pick<ActiveInvocation, 'claim' | 'live'>): Promise<void>;
  quarantine(extension: string, reason: QuarantineReason): Promise<void>;
  kernelCommand(claim: Claim): Promise<void>;
  integrityFailed(claim: Claim): Promise<void>;
}
