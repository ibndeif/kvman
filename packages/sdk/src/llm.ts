/** An LLM failure code a provider reports with `llmProblem`. */
export type LlmProblemCode = 'LLM_NOT_CONFIGURED' | 'LLM_MODEL_NOT_FOUND' | 'LLM_THINKING_UNSUPPORTED' | 'LLM_CONTEXT_OVERFLOW' | 'LLM_CALL_FAILED';

/** An LLM failure a provider throws; the kernel turns it into its Problem. */
export interface LlmProblemError extends Error {
  /** The LLM code, its detail, and the retry delay when known. */
  readonly llm: { code: LlmProblemCode; detail: string; retryAfterMs?: number };
}

/** Builds the `Error` a provider throws to fail a call with an LLM code. */
export function llmProblem(code: LlmProblemCode, detail: string, options: { retryAfterMs?: number } = {}): LlmProblemError {
  return Object.assign(new Error(detail), {
    llm: { code, detail, ...(options.retryAfterMs === undefined ? {} : { retryAfterMs: options.retryAfterMs }) },
  });
}
