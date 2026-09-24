import type { Json, Priority, Problem, ReplyPayload } from '@kvman/protocol';
import type { CommitPipeline } from '../storage/commit-pipeline.ts';
import type { MessageState, Sender } from '../storage/commit-unit.ts';
import { kernelProblem, ProblemError } from '../problems.ts';
import type { UlidGenerator } from '../ulid.ts';

export type AdapterCommand = {
  sender: Sender;
  type: string;
  payload: Json;
  workspaceId?: string;
  lane?: string;
  idempotencyKey?: string;
  priority?: Priority;
  deadlineAt?: number;
  delayMs?: number;
  at?: number;
};

export type Submission = { ok: true; id: string; state: MessageState; reply?: ReplyPayload } | { ok: false; problem: Problem };

// A command from a person or a process: its inbox row commits in a standalone transaction (03 §3.3 step 7), and the
// same idempotency key and digest return the original message and its reply (02 §2.7).
export class AdapterPath {
  readonly #pipeline: CommitPipeline;
  readonly #ids: UlidGenerator;

  constructor(pipeline: CommitPipeline, ids: UlidGenerator) {
    this.#pipeline = pipeline;
    this.#ids = ids;
  }

  async submitCommand(command: AdapterCommand): Promise<Submission> {
    const { sender, workspaceId, ...send } = command;
    const messageId = this.#ids.next();
    const result = await this.#pipeline.enqueue({
      origin: { kind: 'adapter', sender, messageId, ...(workspaceId === undefined ? {} : { workspaceId }) },
      writes: [], sends: [send], publishes: [],
    });
    if (!result.committed) return { ok: false, problem: result.problem };
    const [original] = result.duplicates;
    if (original !== undefined) return { ok: true, ...original };
    const [stored] = result.inserted;
    if (stored === undefined) {
      throw new ProblemError(kernelProblem('INTERNAL', { correlationId: messageId, detail: 'a committed adapter unit stored no message' }));
    }
    return { ok: true, id: stored.message.id, state: stored.state };
  }
}
