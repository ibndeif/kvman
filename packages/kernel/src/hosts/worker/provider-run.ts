import {
  jsonObjectSchema, jsonSchema, kernelErrors, llmRequestSchema, type HostToKernelFrame, type Json, type KernelErrorCode, type Problem, type ProvidedFrame,
  type ProvideFrame,
} from '@kvman/protocol';
import type { CompleteContext, Logger, ProviderContext, ProviderDef } from '@kvman/sdk';
import type { ExtensionRecording } from '../../extension/record-extension.ts';
import { kernelProblem, ProblemError } from '../../problems.ts';
import type { RpcClient } from './rpc-client.ts';

const llmCodes = new Set<string>(['LLM_NOT_CONFIGURED', 'LLM_MODEL_NOT_FOUND', 'LLM_THINKING_UNSUPPORTED', 'LLM_CONTEXT_OVERFLOW', 'LLM_CALL_FAILED']);

function isLlmCode(code: unknown): code is KernelErrorCode {
  return typeof code === 'string' && llmCodes.has(code) && code in kernelErrors;
}

// ADR 0153: what a provider function threw, as the kernel's Problem. An `llmProblem(…)` keeps its code, detail, and
// retry-after; a ProblemError from a ctx call passes through; anything else is a retryable LLM_CALL_FAILED whose
// message is never passed on.
export function providerProblem(error: unknown, correlationId: string): Problem {
  if (error instanceof ProblemError) return error.problem;
  const llm: unknown = error instanceof Error && 'llm' in error ? error.llm : undefined;
  if (typeof llm === 'object' && llm !== null && 'code' in llm && isLlmCode(llm.code)) {
    const detail = 'detail' in llm && typeof llm.detail === 'string' ? llm.detail : undefined;
    const retryAfterMs = 'retryAfterMs' in llm && typeof llm.retryAfterMs === 'number' && llm.retryAfterMs >= 0 ? llm.retryAfterMs : undefined;
    return kernelProblem(llm.code, { correlationId, ...(detail === undefined ? {} : { detail }), ...(retryAfterMs === undefined ? {} : { retryAfterMs }) });
  }
  return kernelProblem('LLM_CALL_FAILED', { correlationId, detail: 'the provider failed without a kernel LLM code', retryable: true });
}

function answer(value: Awaited<ReturnType<RpcClient['call']>>): Json | undefined {
  if (!value.ok) throw new ProblemError(value.problem);
  return value.value;
}

// The read-only context of 05 §5.11 and ADR 0153: the calling workspace, the caller's signal, the provider
// extension's merged config and secrets, and log lines attributed to the call.
function providerContext(frame: ProvideFrame, client: RpcClient, signal: AbortSignal): ProviderContext {
  const { invocationId } = frame;
  const log = (level: 'debug' | 'info' | 'warn' | 'error') => (text: string, fields?: Json): void => {
    const checked = fields === undefined ? undefined : jsonObjectSchema.safeParse(fields);
    void client.call(invocationId, { name: 'log', level, message: String(text), ...(checked?.success === true ? { fields: checked.data } : {}) });
  };
  const logger: Logger = { debug: log('debug'), info: log('info'), warn: log('warn'), error: log('error') };
  return {
    workspace: frame.workspace,
    signal,
    config: { get: async () => jsonObjectSchema.parse(answer(await client.call(invocationId, { name: 'config.get', pending: {} })) ?? {}) },
    secrets: {
      get: async (name) => {
        const value = answer(await client.call(invocationId, { name: 'secret.get', secret: name }));
        return typeof value === 'string' ? value : undefined;
      },
    },
    log: logger,
  };
}

function completeContext(frame: ProvideFrame, base: ProviderContext, post: (frame: HostToKernelFrame) => void): CompleteContext {
  return {
    ...base,
    delta: (chunk) => {
      const text = typeof chunk.text === 'string' && chunk.text !== '' ? { text: chunk.text } : {};
      const thinking = typeof chunk.thinking === 'string' && chunk.thinking !== '' ? { thinking: chunk.thinking } : {};
      if ('text' in text || 'thinking' in thinking) post({ frame: 'provider.delta', invocationId: frame.invocationId, ...text, ...thinking });
    },
  };
}

async function call(frame: ProvideFrame, provider: ProviderDef, base: ProviderContext, post: (frame: HostToKernelFrame) => void): Promise<unknown> {
  if (frame.function === 'status') return provider.status(base);
  if (frame.function === 'listModels') return provider.listModels === undefined ? [] : provider.listModels(base);
  const request = llmRequestSchema.parse(frame.input);
  if (frame.function === 'countTokens') {
    if (provider.countTokens === undefined) throw new ProblemError(kernelProblem('LLM_NOT_CONFIGURED', { correlationId: frame.correlationId, detail: `provider ${frame.provider} counts no tokens` }));
    return provider.countTokens(request, base);
  }
  return provider.complete(request, completeContext(frame, base, post));
}

// 03 §3.12, ADR 0153: one provider function in its extension's host. The kernel checks what it answers; a value that
// is not JSON fails like any provider error.
export async function runProvider(
  frame: ProvideFrame, extension: ExtensionRecording, client: RpcClient, signal: AbortSignal, post: (frame: HostToKernelFrame) => void,
): Promise<ProvidedFrame> {
  const provider = extension.providers.get(frame.provider);
  if (provider === undefined) {
    const problem = kernelProblem('LLM_NOT_CONFIGURED', { correlationId: frame.correlationId, detail: `${frame.extension} registers no provider ${frame.provider}` });
    return { frame: 'provided', invocationId: frame.invocationId, outcome: { ok: false, problem } };
  }
  try {
    const value = jsonSchema.parse(await call(frame, provider, providerContext(frame, client, signal), post));
    return { frame: 'provided', invocationId: frame.invocationId, outcome: { ok: true, value } };
  } catch (error) {
    return { frame: 'provided', invocationId: frame.invocationId, outcome: { ok: false, problem: providerProblem(error, frame.correlationId) } };
  }
}
