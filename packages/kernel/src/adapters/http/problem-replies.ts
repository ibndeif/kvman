import type { Issue, Problem } from '@kvman/protocol';
import type { FastifyReply } from 'fastify';
import { kernelProblem } from '../../problems.ts';
import type { UlidGenerator } from '../../ulid.ts';
import { statusOf } from './problem-status.ts';

// A zod-shaped validation failure, as a request body or header check reports it.
export type ValidationIssues = ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string; code: string }>;

export function sendProblem(reply: FastifyReply, problem: Problem): FastifyReply {
  return reply.code(statusOf(problem.code)).header('content-type', 'application/json; charset=utf-8').send(problem);
}

export function issuesOf(issues: ValidationIssues): Issue[] {
  return issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message, code: issue.code }));
}

// Refusals at the edge have no message yet; each gets its own correlation id (13 §13.1).
export class EdgeProblems {
  readonly #ids: UlidGenerator;

  constructor(ids: UlidGenerator) {
    this.#ids = ids;
  }

  invalid(detail: string, issues?: ValidationIssues): Problem {
    return kernelProblem('VALIDATION_FAILED', { correlationId: this.#ids.next(), detail, ...(issues === undefined ? {} : { issues: issuesOf(issues) }) });
  }

  refused(code: 'HOST_FORBIDDEN' | 'NOT_FOUND' | 'KERNEL_STOPPING' | 'INTERNAL', detail?: string): Problem {
    return kernelProblem(code, { correlationId: this.#ids.next(), ...(detail === undefined ? {} : { detail }) });
  }

  tooLarge(max: number): Problem {
    return kernelProblem('PAYLOAD_TOO_LARGE', { correlationId: this.#ids.next(), params: { limit: 'payload', max } });
  }
}
