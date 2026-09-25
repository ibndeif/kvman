import type { HostToKernelFrame, Problem, RpcCall, RpcResult, RpcResultFrame } from '@kvman/protocol';

// A host's calls to the kernel (03 §3.5): each `rpc` frame is answered by one `rpcResult` with the same call id.
export class RpcClient {
  readonly #post: (frame: HostToKernelFrame) => void;
  readonly #pending = new Map<string, (result: RpcResult) => void>();
  #nextCall = 1;

  constructor(post: (frame: HostToKernelFrame) => void) {
    this.#post = post;
  }

  call(invocationId: string, call: RpcCall): Promise<RpcResult> {
    const callId = this.#nextCall;
    this.#nextCall += 1;
    const answered = new Promise<RpcResult>((resolve) => this.#pending.set(`${invocationId}\n${callId}`, resolve));
    this.#post({ frame: 'rpc', invocationId, callId, call });
    return answered;
  }

  // ADR 0084: an aborted invocation's calls in flight end with the problem that ended it, so its handler unwinds.
  abandon(invocationId: string, problem: Problem): void {
    for (const [key, resolve] of this.#pending) {
      if (!key.startsWith(`${invocationId}\n`)) continue;
      this.#pending.delete(key);
      resolve({ ok: false, problem });
    }
  }

  answered(frame: RpcResultFrame): void {
    const key = `${frame.invocationId}\n${frame.callId}`;
    const resolve = this.#pending.get(key);
    this.#pending.delete(key);
    resolve?.(frame.result);
  }
}
