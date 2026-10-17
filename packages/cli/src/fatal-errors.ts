import type { Kernel } from '@kvman/kernel';
import { ProblemError } from '@kvman/sdk';

// An error nothing caught (plan 02 §2.14, ADR 0085, 6): it is written to `logs/kvman.log` with its code and stack, never
// a payload, and then kvman stops at once through `stop`.

type Logger = Kernel['web']['logger'];
type FatalEvent = 'uncaughtException' | 'unhandledRejection';
type FatalSource = { on(event: FatalEvent, listener: (error: unknown) => void): unknown; off(event: FatalEvent, listener: (error: unknown) => void): unknown };

export type FatalErrors = { dispose(): void };

function codeOf(error: unknown): string | undefined {
  if (error instanceof ProblemError) return error.problem.code;
  return error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : undefined;
}

/** The fields of the record: the error's code when it has one, and its stack. */
export function fatalFields(error: unknown): { code?: string; stack: string } {
  const code = codeOf(error);
  const stack = error instanceof Error ? (error.stack ?? error.message) : String(error);
  return code === undefined ? { stack } : { code, stack };
}

export function listenForFatal(source: FatalSource, logger: Logger, stop: () => void): FatalErrors {
  const onError = (error: unknown): void => {
    logger.error('kvman stopped on an unexpected error.', fatalFields(error));
    stop();
  };
  source.on('uncaughtException', onError);
  source.on('unhandledRejection', onError);
  return {
    dispose: () => {
      source.off('uncaughtException', onError);
      source.off('unhandledRejection', onError);
    },
  };
}
