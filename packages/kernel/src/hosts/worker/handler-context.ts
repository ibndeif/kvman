import type { Ctx, Store } from '@kvman/sdk';
import { createStepFunction } from '../../store/step-journal.ts';
import { createFiles } from './context-files.ts';
import { createLlm } from './context-llm.ts';
import { createMessaging, type MessagingParts } from './context-messaging.ts';
import { createProcesses } from './context-process.ts';
import { createSettings } from './context-settings.ts';
import { createText } from './context-text.ts';
import { stepRecorder } from './step-recorder.ts';

export type ContextParts = MessagingParts & { store: Store };

// The ctx a handler receives (05 §5.4, ADR 0066); every member refuses once the handler has settled (ADR 0076).
export function createContext(parts: ContextParts): Ctx {
  const { state, client, values, store } = parts;
  const { invoke } = state;
  const { message } = invoke;
  const step = createStepFunction(stepRecorder(client, invoke.invocationId, values), message.id, message.correlationId);
  const messaging = createMessaging(parts);
  return {
    message,
    context: message.context,
    signal: state.signal,
    deadlineAt: invoke.deadlineAt,
    ...(invoke.workspace === undefined ? {} : { workspace: invoke.workspace }),
    ids: {
      new: () => {
        state.open();
        return values.id();
      },
    },
    now: () => {
      state.open();
      return values.now();
    },
    ...createText(state, parts.extension.manifest),
    ...messaging,
    ...createSettings(parts),
    ...createLlm({ command: messaging.command, query: messaging.query, workspaceId: invoke.workspace?.id }),
    files: createFiles(parts),
    process: createProcesses(parts),
    get store() {
      state.open();
      return store;
    },
    step: (name, effect, options) => {
      state.writable('step');
      return step(name, effect, options);
    },
  };
}
