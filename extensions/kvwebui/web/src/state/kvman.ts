import { kernelQuerySchemas, ProblemError, type Json } from '@kvman/sdk';
import type { Kvman, StreamEvent } from '@kvman/sdk/web';
import { computed } from 'vue';
import { runCommand } from './commands.ts';
import { readEvents } from './event-reader.ts';
import { follow } from './follow.ts';
import type { Kvwebui } from './kvwebui.ts';
import { pageLocation } from './navigation.ts';
import { openPanel } from './panels.ts';

// The `kvman` object a custom component injects (plan 06 §6.4, ADR 0009, 83). Each shown component gets its own, so
// the streams it opened close when it unmounts (`close`).

export type KvmanHandle = { kvman: Kvman; close(): void };

function isQuery(state: Kvwebui, name: string): boolean {
  return Object.hasOwn(kernelQuerySchemas, name) || state.extensions.value.some((extension) => extension.queries.some((query) => query.name === name));
}

// The output of a call, as the caller's declared type (the kernel checked it against the handler's schema).
function typed<Output>(output: Json): Output {
  return output as Output;
}

export function createKvman(state: Kvwebui, t: Kvman['t'], View: Kvman['View']): KvmanHandle {
  const readers = new Set<() => void>();
  const workspace = computed(() => state.workspaces.value.find((candidate) => candidate.id === state.workspace.value) ?? { id: state.workspace.value, name: state.workspace.value, path: '' });
  const kvman: Kvman = {
    exec: async (name, input) => {
      if (isQuery(state, name)) return typed(await state.api.query(name, input));
      const outcome = await runCommand(state, name, input, () => undefined);
      if (!outcome.ok) throw new ProblemError(outcome.problem);
      return typed(outcome.output);
    },
    execAsync: async (name, input) => {
      const jobId = await state.api.start(name, input);
      void follow(state, jobId);
      return jobId;
    },
    stream: (jobId) => ({
      [Symbol.asyncIterator]: (): AsyncIterator<StreamEvent> => {
        const reader = readEvents(state.jobs, jobId, () => readers.delete(reader.close));
        readers.add(reader.close);
        return reader.iterator;
      },
    }),
    follow: (jobId) => follow(state, jobId),
    navigate: (page, params) => {
      void state.router.push(pageLocation(state.registry.value, page, params ?? {}));
    },
    toast: (text, params, level) => state.toasts.show({ text, params: params ?? {}, level: level ?? 'info' }),
    panel: (id, open) => openPanel(state, id, open),
    t,
    workspace,
    View,
  };
  return {
    kvman,
    close: () => {
      for (const close of [...readers]) close();
    },
  };
}
