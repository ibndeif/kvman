import { problemSchema, type Issue, type KernelErrorCode, type Manifest, type Message, type Problem } from '@kvman/protocol';
import type { ProblemOptions } from '@kvman/sdk';
import { kernelProblem, ProblemError } from '../../problems.ts';

export function hostProblem(message: Message, code: KernelErrorCode, detail: string, issues?: Issue[]): ProblemError {
  return new ProblemError(kernelProblem(code, { correlationId: message.correlationId, messageId: message.id, detail, ...(issues === undefined ? {} : { issues }) }));
}

export type ExtensionProblem = { problem: Problem; registered: boolean };

// ctx.problem (13 §13.1, ADR 0074): a registered code takes its title, hint, and retryable; any other is delivered as
// it is with its code as the title, not retryable.
export function extensionProblem(manifest: Manifest, message: Message, code: string, options: ProblemOptions = {}): ExtensionProblem {
  const registered = manifest.errors.find((error) => error.code === code);
  const candidate = {
    code, title: registered?.title ?? code, retryable: registered?.retryable ?? false,
    ...(registered?.hint === undefined ? {} : { hint: registered.hint }),
    ...(options.detail === undefined ? {} : { detail: options.detail }),
    ...(options.params === undefined ? {} : { params: options.params }),
    correlationId: message.correlationId, messageId: message.id,
  };
  const parsed = problemSchema.safeParse(candidate);
  if (!parsed.success) {
    throw hostProblem(message, 'VALIDATION_FAILED', `"${code}" is not an error code`, [{ path: 'code', message: 'expected "<namespace>/UPPER_SNAKE"' }]);
  }
  return { problem: parsed.data, registered: registered !== undefined };
}

const deniedOperations: Record<string, string> = {
  FileSystemRead: 'a file read', FileSystemWrite: 'a file write', ChildProcess: 'a child process', WorkerThreads: 'a worker', Addon: 'a native addon',
};

// ADR 0129: what Node's permission model refused in a sandboxed host, named without its path.
function deniedOperation(error: unknown): string | undefined {
  if (!(error instanceof Error) || !('code' in error)) return undefined;
  if (error.code === 'ERR_DLOPEN_DISABLED') return 'a native addon';
  if (error.code !== 'ERR_ACCESS_DENIED') return undefined;
  const permission = 'permission' in error && typeof error.permission === 'string' ? error.permission : '';
  return deniedOperations[permission] ?? 'an operation';
}

// A thrown ProblemError passes through; an operation the permission model refused is CAPABILITY_DENIED (ADR 0129);
// anything else is INTERNAL, retryable, without its text (13 §13.1).
export function problemOfThrown(error: unknown, message: Message): Problem {
  if (error instanceof ProblemError) return error.problem;
  const denied = deniedOperation(error);
  const context = { correlationId: message.correlationId, messageId: message.id };
  if (denied !== undefined) return kernelProblem('CAPABILITY_DENIED', { ...context, detail: `this sandboxed host may not perform ${denied}`, hint: 'reach files, processes, and the network through ctx' });
  return kernelProblem('INTERNAL', context);
}
