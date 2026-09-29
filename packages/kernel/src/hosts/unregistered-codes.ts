import type { Manifest, Problem } from '@kvman/protocol';
import type { Claim } from '../scheduler/dispatcher.ts';
import type { KernelLogger } from './kernel-logger.ts';

// The message of the warning, which the testkit collects (ADR 0166).
export const unregisteredCodeMessage = 'a handler failed with an error code its extension did not register';

export type UnregisteredCodesDeps = { logger: KernelLogger; manifestOf(extension: string): Manifest | undefined };

// 13 §13.1, ADR 0166: a handler that ends with a code of its own namespace that its extension never registered is
// delivered as it is and logged, so the testkit can fail the test. Kernel codes and codes passed on from another
// extension's call are not the handler's to register.
export class UnregisteredCodes {
  readonly #deps: UnregisteredCodesDeps;

  constructor(deps: UnregisteredCodesDeps) {
    this.#deps = deps;
  }

  check(claim: Claim, problem: Problem): void {
    const slash = problem.code.indexOf('/');
    if (slash < 0) return;
    const manifest = this.#deps.manifestOf(claim.extension);
    if (manifest === undefined || problem.code.slice(0, slash) !== manifest.meta.namespace) return;
    if (manifest.errors.some((error) => error.code === problem.code)) return;
    const { message } = claim;
    this.#deps.logger.write({
      level: 'warn', message: unregisteredCodeMessage,
      fields: { code: problem.code, type: message.type },
      attributes: { correlationId: message.correlationId, messageId: message.id, extension: claim.extension },
    });
  }
}
