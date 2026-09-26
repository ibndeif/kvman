import type { Issue, Json, KernelErrorCode, Problem } from '@kvman/protocol';
import { kernelProblem } from '../problems.ts';

type FailureCode = Extract<KernelErrorCode, 'EXT_SOURCE_INVALID' | 'EXT_MANIFEST_INVALID' | 'CONFIRMATION_EXPIRED' | 'EXT_IN_USE' | 'NOT_FOUND'>;

export type FailureDetails = { detail: string; hint?: string; params?: Record<string, Json>; issues?: Issue[] };

// A step of the install pipeline that refuses the package; the command that ran it turns it into its Problem.
export class InstallFailure extends Error {
  readonly code: FailureCode;
  readonly details: FailureDetails;

  constructor(code: FailureCode, details: FailureDetails) {
    super(`${code}: ${details.detail}`);
    this.name = 'InstallFailure';
    this.code = code;
    this.details = details;
  }

  problem(correlationId: string, messageId?: string): Problem {
    return kernelProblem(this.code, { correlationId, ...(messageId === undefined ? {} : { messageId }), ...this.details });
  }
}

export function sourceInvalid(detail: string, extra: Omit<FailureDetails, 'detail'> = {}): InstallFailure {
  return new InstallFailure('EXT_SOURCE_INVALID', { detail, ...extra });
}
