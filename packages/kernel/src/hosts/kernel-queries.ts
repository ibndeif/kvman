import { schemaGetRequestSchema, validateRequestSchema, type HealthResult, type Json, type Message, type Problem } from '@kvman/protocol';
import { kernelProblem } from '../problems.ts';
import type { KernelRegistry } from '../registry/kernel-registry.ts';
import { kernelEventPayloads, kernelTypeEntries } from '../registry/kernel-types.ts';
import { builtinComponentEntries } from '../registry/schema-components.ts';
import { schemaDocument } from '../registry/schema-document.ts';
import type { Connection } from '../storage/driver.ts';
import { validateRequest } from '../validation/kernel-validate.ts';
import type { QueryAnswer } from './query-path.ts';
import { readWorkspace } from './workspace-rows.ts';

export type KernelQueriesDeps = {
  connection: Connection;
  registry: () => KernelRegistry;
  health: () => HealthResult;
  version: string;
};

// The kernel's own queries (03 §3.8), answered in memory on the main thread like every query (02 §2.3).
export class KernelQueries {
  readonly #deps: KernelQueriesDeps;
  readonly #kernelTypes = kernelTypeEntries();
  readonly #kernelEvents = kernelEventPayloads();
  readonly #components = builtinComponentEntries();

  constructor(deps: KernelQueriesDeps) {
    this.#deps = deps;
  }

  answer(message: Message): QueryAnswer {
    if (message.type === 'kernel.health.get') return { ok: true, value: this.#deps.health() satisfies Json };
    if (message.type === 'kernel.schema.get') return this.#schema(message);
    if (message.type === 'kernel.validate') return this.#validate(message);
    return this.#refused(message, 'INTERNAL', `the kernel has no handler for ${message.type}`);
  }

  // 12 §12.7, ADR 0111: a workspace without a row is refused rather than listed empty.
  #schema(message: Message): QueryAnswer {
    const request = schemaGetRequestSchema.parse(message.payload);
    if (request.workspaceId !== undefined && readWorkspace(this.#deps.connection, request.workspaceId) === undefined) {
      return this.#refused(message, 'WORKSPACE_INVALID', `no workspace ${request.workspaceId} exists`);
    }
    const sources = {
      version: this.#deps.version, kernelTypes: this.#kernelTypes, extensions: this.#deps.registry().listed(request.workspaceId), components: this.#components,
    };
    return { ok: true, value: schemaDocument(sources, request.q) satisfies Json };
  }

  #validate(message: Message): QueryAnswer {
    const request = validateRequestSchema.parse(message.payload);
    const outcome = validateRequest(request, { kernelEvents: this.#kernelEvents, configSchemas: this.#deps.registry().configSchemas() });
    if (outcome.answered) return { ok: true, value: outcome.result satisfies Json };
    const [first] = outcome.issues;
    return { ok: false, problem: this.#problem(message, 'VALIDATION_FAILED', first?.message ?? 'the request cannot be validated', outcome.issues) };
  }

  #refused(message: Message, code: 'INTERNAL' | 'WORKSPACE_INVALID', detail: string): QueryAnswer {
    return { ok: false, problem: this.#problem(message, code, detail, []) };
  }

  #problem(message: Message, code: 'INTERNAL' | 'WORKSPACE_INVALID' | 'VALIDATION_FAILED', detail: string, issues: Problem['issues']): Problem {
    return kernelProblem(code, { correlationId: message.correlationId, messageId: message.id, detail, ...(issues === undefined || issues.length === 0 ? {} : { issues }) });
  }
}
