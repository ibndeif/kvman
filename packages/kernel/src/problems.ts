import { ProblemError, type Json, type KernelProblemCode } from '@kvman/sdk';

// Makes the error that carries one of the kernel's Problems (plan 05).
export function kernelProblem(code: KernelProblemCode, message: string, params?: Readonly<Record<string, Json>>): ProblemError {
  return new ProblemError(params === undefined ? { code, message } : { code, message, params: { ...params } });
}
