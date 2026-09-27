import {
  compareByCodePoint, limits, matchesTypePattern, socketRequestSchema, type Json, type MessageStatus, type Problem, type ReplyPayload, type SocketAnswer,
  type SocketRequest,
} from '@kvman/protocol';
import type { QueryPath } from '../../hosts/query-path.ts';
import type { ReplyWaiters } from '../../hosts/reply-waiters.ts';
import { kernelProblem } from '../../problems.ts';
import { tokenSender, type JobTokens, type TokenGrant } from '../../processes/job-tokens.ts';
import { helpMarkdown, type CallableEntry } from '../../processes/help-rendering.ts';
import type { KernelRegistry } from '../../registry/kernel-registry.ts';
import { kernelTypeEntries } from '../../registry/kernel-types.ts';
import type { GrantsSource } from '../../router/grants.ts';
import { checkAccess, checkCallCapability } from '../../router/permission-checks.ts';
import { Refusal } from '../../router/refusal.ts';
import type { SchedulerTimers } from '../../scheduler/timers.ts';
import type { CommitPipeline } from '../../storage/commit-pipeline.ts';
import type { UlidGenerator } from '../../ulid.ts';

export type SocketRequestsDeps = {
  tokens: JobTokens;
  registry: () => KernelRegistry;
  grants: GrantsSource;
  pipeline: CommitPipeline;
  queries: QueryPath;
  waiters: ReplyWaiters;
  status: (messageId: string) => MessageStatus | undefined;
  timers: SchedulerTimers;
  ids: UlidGenerator;
};

type Callable = { entry: CallableEntry; owner: string };

class Refused extends Error {
  readonly problem: Problem;

  constructor(problem: Problem) {
    super(problem.title);
    this.name = 'Refused';
    this.problem = problem;
  }
}

function tokenOf(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || !('token' in value)) return undefined;
  return typeof value.token === 'string' && value.token.length > 0 ? value.token : undefined;
}

// 12 §12.4, ADRs 0140 and 0141: what kernel.sock does with one request. The token names the process and its grant;
// a type must match the token's patterns, then pass admission as `proc:<processId>` with the grants of the spawner
// or of the actor the token delegates, chained under the spawning message.
export class SocketRequests {
  readonly #deps: SocketRequestsDeps;

  constructor(deps: SocketRequestsDeps) {
    this.#deps = deps;
  }

  async answer(line: string): Promise<SocketAnswer> {
    try {
      const { grant, request } = this.#read(line);
      if (request.op === 'help') return { ok: true, data: request.type === undefined ? this.#list(grant) : this.#describe(grant, request.type) };
      this.#callable(grant, request.type);
      if (request.op === 'query') return this.#queried(await this.#deps.queries.ask({ sender: tokenSender(grant), type: request.type, payload: request.payload, cause: grant.cause, workspaceId: grant.cause.workspaceId }));
      return await this.#command(grant, request);
    } catch (error) {
      if (error instanceof Refused) return { ok: false, problem: error.problem };
      throw error;
    }
  }

  refused(code: 'VALIDATION_FAILED' | 'PAYLOAD_TOO_LARGE' | 'KERNEL_STOPPING', detail: string): SocketAnswer {
    return { ok: false, problem: kernelProblem(code, { correlationId: this.#deps.ids.next(), detail }) };
  }

  #read(line: string): { grant: TokenGrant; request: SocketRequest } {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new Refused(this.#problem('VALIDATION_FAILED', 'the request is not JSON'));
    }
    const token = tokenOf(parsed);
    const grant = token === undefined ? undefined : this.#deps.tokens.resolve(token);
    if (grant === undefined) throw new Refused(this.#problem('CAPABILITY_DENIED', 'the job token is not valid'));
    const request = socketRequestSchema.safeParse(parsed);
    if (!request.success) {
      const issues = request.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
      throw new Refused(kernelProblem('VALIDATION_FAILED', { correlationId: grant.cause.correlationId, detail: 'the request does not match its schema', issues }));
    }
    return { grant, request: request.data };
  }

  // The types a token may call right now, sorted: its patterns, then the checks admission makes.
  #list(grant: TokenGrant): Json {
    const workspaceId = grant.cause.workspaceId;
    const registry = this.#deps.registry();
    const candidates = [...kernelTypeEntries(), ...registry.listed(workspaceId).flatMap((manifest) => manifest.types)];
    const types = new Set(candidates.filter((entry) => entry.kind !== 'event').map((entry) => entry.type));
    const allowed = [...types].sort(compareByCodePoint).flatMap((type) => {
      const callable = this.#allowed(grant, type);
      return callable === undefined ? [] : [{ type, kind: callable.entry.kind, description: callable.entry.description }];
    });
    return { types: allowed };
  }

  #describe(grant: TokenGrant, type: string): Json {
    const { entry } = this.#callable(grant, type);
    return {
      type, kind: entry.kind, description: entry.description, input: entry.input, ...(entry.output === undefined ? {} : { output: entry.output }), markdown: helpMarkdown(entry),
    };
  }

  #allowed(grant: TokenGrant, type: string): Callable | undefined {
    try {
      return this.#callable(grant, type);
    } catch (error) {
      if (error instanceof Refused) return undefined;
      throw error;
    }
  }

  #callable(grant: TokenGrant, type: string): Callable {
    const { correlationId, workspaceId } = grant.cause;
    if (!grant.calls.some((pattern) => matchesTypePattern(pattern, type))) throw new Refused(this.#problem('CAPABILITY_DENIED', `the job token does not allow "${type}"`, correlationId));
    const lookup = this.#deps.registry().lookup(type, workspaceId);
    if (!lookup.ok) throw new Refused(kernelProblem(lookup.failure.code, { correlationId, detail: lookup.failure.detail }));
    const { entry, extension } = lookup.resolved;
    if (entry.kind === 'event') throw new Refused(kernelProblem('TYPE_NOT_FOUND', { correlationId, detail: `"${type}" is an event` }));
    // 12 §12.4: a process is never a person, so user and internal types are CALLER_NOT_ALLOWED before any grant is read.
    try {
      checkAccess(tokenSender(grant), extension, entry);
      checkCallCapability({ grants: this.#deps.grants, registry: this.#deps.registry }, tokenSender(grant), { owner: extension, entry }, workspaceId);
    } catch (error) {
      if (error instanceof Refusal) throw new Refused(error.problem(correlationId));
      throw error;
    }
    return { entry, owner: extension };
  }

  async #command(grant: TokenGrant, request: Extract<SocketRequest, { op: 'command' }>): Promise<SocketAnswer> {
    const messageId = this.#deps.ids.next();
    const send = {
      type: request.type, payload: request.payload, context: grant.context, ...(request.idempotencyKey === undefined ? {} : { idempotencyKey: request.idempotencyKey }),
    };
    const result = await this.#deps.pipeline.enqueue({
      origin: { kind: 'call', sender: tokenSender(grant), cause: grant.cause, messageId, received: new Set() }, writes: [], sends: [send], publishes: [], replies: [],
    });
    if (!result.committed) return { ok: false, problem: result.problem };
    const [original] = result.duplicates;
    if (original?.reply !== undefined) return this.#replied(original.reply);
    const id = original?.id ?? result.inserted[0]?.message.id;
    if (id === undefined) return { ok: false, problem: this.#problem('INTERNAL', 'a committed command stored no message', grant.cause.correlationId) };
    return this.#waitFor(id, request.wait ?? limits.maxCommandWaitMs);
  }

  // 12 §12.2: the reply within `wait`, else `{ id, state }` (also when the handler defers).
  #waitFor(id: string, waitMs: number): Promise<SocketAnswer> {
    const accepted = (): SocketAnswer => ({ ok: true, data: { id, state: this.#deps.status(id)?.state ?? 'pending' } });
    if (waitMs === 0) return Promise.resolve(accepted());
    return new Promise((resolve) => {
      let answered = false;
      let timer: { cancel(): void } | undefined;
      let stopListening: () => void = () => undefined;
      const finish = (answer: () => SocketAnswer): void => {
        if (answered) return;
        answered = true;
        timer?.cancel();
        stopListening();
        resolve(answer());
      };
      // A stored reply is answered inside listen(), before it returns the function that stops listening.
      stopListening = this.#deps.waiters.listen(id, { replied: (reply) => finish(() => this.#replied(reply)), deferred: () => finish(accepted) });
      if (answered) stopListening();
      else timer = this.#deps.timers.set(waitMs, () => finish(accepted));
    });
  }

  #replied(reply: ReplyPayload): SocketAnswer {
    return reply.ok ? { ok: true, data: reply.value } : { ok: false, problem: reply.problem };
  }

  #queried(answer: { ok: true; value: Json } | { ok: false; problem: Problem }): SocketAnswer {
    return answer.ok ? { ok: true, data: answer.value } : { ok: false, problem: answer.problem };
  }

  #problem(code: 'CAPABILITY_DENIED' | 'VALIDATION_FAILED' | 'INTERNAL', detail: string, correlationId: string = this.#deps.ids.next()): Problem {
    return kernelProblem(code, { correlationId, detail });
  }
}
