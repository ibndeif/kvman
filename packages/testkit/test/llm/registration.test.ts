import { derivedCapabilities, ProblemError, recordExtension } from '@kvman/kernel';
import type { Issue } from '@kvman/protocol';
import { defineExtension, llmProblem, type ExtensionDefinition, type ProviderDef } from '@kvman/sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { workspaceA } from '../hosts/harness.ts';
import { command, person, problemOf, sendAs, type InstallFixture } from '../install/harness.ts';
import { enable, rows, valueOf } from '../workspaces/harness.ts';
import { installFakeProvider, llmTests, openLlmFixture, refreshWait, waitForFakeModel } from './harness.ts';
import lister from './fixtures/extensions/lister.ts';

const correlationId = '01JAZ3K4M5N6P7Q8R9S0T1V2W3';

function recordDefinition(definition: ExtensionDefinition): ReturnType<typeof recordExtension> {
  return recordExtension(definition, { packageName: definition.meta.name, version: '1.0.0', correlationId });
}

function recordFailure(definition: ExtensionDefinition): Issue[] {
  try {
    recordDefinition(definition);
  } catch (error) {
    if (error instanceof ProblemError) return [...(error.problem.issues ?? [])];
    throw error;
  }
  throw new Error('the recording was expected to fail');
}

describe('LLM registration (plan 05 §§5.11–5.12, ADR 0152)', () => {
  it('M2.9-E5 registering a provider and a model records the manifest llm section', () => {
    const { manifest } = recordDefinition(lister);
    expect(manifest.llm.providers).toEqual([{
      id: 'lister',
      title: 'Lister',
      description: 'Lists models from its config.',
      auth: 'none',
      functions: ['provider:lister.complete', 'provider:lister.status', 'provider:lister.listModels', 'provider:lister.countTokens'],
    }]);
    expect(manifest.llm.models).toEqual([{
      id: 'lister-static',
      provider: 'lister',
      title: 'Lister Static',
      description: 'A static lister model.',
      contextWindow: 8000,
      maxOutput: 1000,
      capabilities: { tools: false, vision: false, thinking: [] },
    }]);
    expect(derivedCapabilities(manifest).derived.providesLlm).toEqual(['lister']);

    const provider: ProviderDef = {
      title: 'Dup',
      description: 'Dup.',
      auth: 'none',
      status: async () => ({ configured: true }),
      complete: async () => ({
        content: 'ok',
        usage: { input: 1, output: 1 },
        model: { provider: 'dup', id: 'dup-model' },
        stopReason: 'end',
      }),
    };
    const duplicate = defineExtension(
      { name: '@acme/dup', namespace: 'dup', title: 'Dup', description: 'Registers dup twice.' },
      (ext) => {
        ext.registerProvider('dup', provider);
        ext.registerProvider('dup', provider);
      },
    );
    expect(recordFailure(duplicate)).toEqual([
      { path: 'llm.providers.1', message: 'provider dup is already registered', hint: 'register each provider once' },
    ]);
  });
});

describe('LLM problems (ADR 0153)', llmTests, () => {
  let fixture: InstallFixture | undefined;

  afterEach(async () => {
    await fixture?.close();
    fixture = undefined;
  });

  it('M2.9-E7 llmProblem values fail the call with their kernel code, retryability, and retry-after', async () => {
    expect(llmProblem('LLM_CALL_FAILED', 'busy', { retryAfterMs: 500 }).llm)
      .toEqual({ code: 'LLM_CALL_FAILED', detail: 'busy', retryAfterMs: 500 });
    expect(llmProblem('LLM_CONTEXT_OVERFLOW', 'too long').llm)
      .toEqual({ code: 'LLM_CONTEXT_OVERFLOW', detail: 'too long' });

    const current = fixture = await openLlmFixture();
    await installFakeProvider(current, { failures: 1, retryAfterMs: 500 });
    valueOf(await enable(current, workspaceA, '@kvman/fake-provider'));
    valueOf(await enable(current, workspaceA, '@acme/asker'));
    valueOf(await enable(current, workspaceA, '@acme/broken'));
    await waitForFakeModel(current);
    await vi.waitFor(() => {
      expect(rows(current, "SELECT id FROM llm_models WHERE provider = 'broken'")).toHaveLength(1);
    }, refreshWait);

    const started = current.timers.time.value;
    const asked = await sendAs(current, person, 'asker.ask', {
      purpose: 'chat', model: { provider: 'fake', id: 'fake-model' },
    }, workspaceA);
    await vi.waitFor(() => {
      expect(rows(current, "SELECT state, attempts FROM messages WHERE type = 'kernel.llm.complete'"))
        .toEqual([{ state: 'pending', attempts: 1 }]);
    }, refreshWait);
    const [failed] = rows(current, "SELECT not_before FROM messages WHERE type = 'kernel.llm.complete'");
    expect(Number(failed?.['not_before'])).toBeGreaterThanOrEqual(started + Math.max(1_000, 500));
    current.timers.advance(1_000);
    expect(await current.runtime.awaitReply(asked)).toMatchObject({ ok: true, value: { content: 'ok' } });

    valueOf(await command(current, 'kernel.config.set', {
      extension: '@acme/broken', scope: 'global', value: { mode: 'overflow' }, revision: 0,
    }));
    const overflow = problemOf(await command(current, 'asker.ask', {
      purpose: 'chat', model: { provider: 'broken', id: 'broken-model' },
    }, person, workspaceA));
    expect(overflow).toMatchObject({ code: 'LLM_CONTEXT_OVERFLOW' });
    expect(overflow.retryable ?? false).toBe(false);
  });
});
