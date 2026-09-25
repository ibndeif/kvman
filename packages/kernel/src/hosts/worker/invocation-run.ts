import { jsonSchema, type CompleteFrame, type HostOutcome, type HostUnitOfWork, type InvokeFrame, type Issue, type NewRecordedValues } from '@kvman/protocol';
import type { ExtensionRecording } from '../../extension/record-extension.ts';
import type { Schema } from '../../extension/recording.ts';
import { ProblemError } from '../../problems.ts';
import { createHandlerStore, type HandlerStore } from '../../store/store-api.ts';
import type { UnindexedScanThrottle } from '../../store/store-context.ts';
import type { StoreReader } from '../../store/store-reader.ts';
import { createContext } from './handler-context.ts';
import { hostProblem, problemOfThrown } from './host-problems.ts';
import { InvocationState } from './invocation-state.ts';
import { InvocationValues } from './invocation-values.ts';
import type { RpcClient } from './rpc-client.ts';

export type RunParts = {
  invoke: InvokeFrame;
  extension: ExtensionRecording;
  client: RpcClient;
  reader: StoreReader;
  throttle: UnindexedScanThrottle;
  newId: () => string;
  clock: () => number;
};

const nothing: HostUnitOfWork = { writes: [], sends: [], publishes: [], replies: [] };
const noNewValues: NewRecordedValues = { id: [], now: [] };

function issuesOf(error: { issues: ReadonlyArray<{ path: PropertyKey[]; message: string }> }): Issue[] {
  return error.issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message }));
}

function parsed(invoke: InvokeFrame, schema: Schema, value: unknown, what: string): unknown {
  const result = schema.safeParse(value);
  if (!result.success) throw hostProblem(invoke.message, 'VALIDATION_FAILED', `the ${what} does not match its schema`, issuesOf(result.error));
  return result.data;
}

// 05 §5.12, ADR 0074 and 0076: inputs are parsed with the full Zod schema; an event only when it is the extension's own.
function inputOf(invoke: InvokeFrame, extension: ExtensionRecording): unknown {
  const { message } = invoke;
  const handler = extension.schemas.handlers.get(invoke.handler);
  if (handler !== undefined) return parsed(invoke, handler.input, message.payload, 'input');
  const event = extension.schemas.events.get(message.type);
  return event === undefined ? message.payload : parsed(invoke, event, message.payload, 'event payload');
}

function outcomeOf(invoke: InvokeFrame, extension: ExtensionRecording, state: InvocationState, result: unknown): HostOutcome {
  const { deferral } = state;
  if (deferral !== undefined && result === deferral.marker) return deferral.onAbort === undefined ? { deferred: true } : { deferred: true, onAbort: deferral.onAbort };
  if (invoke.kind === 'event') return { ok: true, value: null };
  const output = extension.schemas.handlers.get(invoke.handler)?.output;
  const value = output === undefined ? result ?? null : parsed(invoke, output, result, 'result');
  const json = jsonSchema.safeParse(value);
  if (!json.success) throw hostProblem(invoke.message, 'VALIDATION_FAILED', 'the result is not JSON', issuesOf(json.error));
  return { ok: true, value: json.data };
}

function handlerStore(parts: RunParts): HandlerStore {
  const { invoke, extension, client, reader, throttle } = parts;
  const { manifest, schemas } = extension;
  return createHandlerStore({
    reader, owner: invoke.extension, workspaceId: invoke.message.workspaceId, correlationId: invoke.message.correlationId, readOnly: invoke.readOnly,
    data: { collections: manifest.data.collections.map(({ name, idField, indexes }) => ({ name, idField, indexes: indexes ?? [] })), logs: manifest.data.logs.map((log) => log.prefix) },
    validateDocument: (collection, document) => {
      const schema = schemas.collections.get(collection);
      const result = schema?.safeParse(document);
      return result === undefined || result.success ? [] : issuesOf(result.error);
    },
    unindexedScans: {
      note: (scan) => {
        if (!throttle.due(scan)) return;
        void client.call(invoke.invocationId, { name: 'log', level: 'warn', message: 'a find scanned a collection without a matching index', fields: { collection: scan.collection, shape: scan.shape } });
      },
    },
  });
}

function completeFrame(invoke: InvokeFrame, outcome: HostOutcome, unitOfWork: HostUnitOfWork, recorded: NewRecordedValues): CompleteFrame {
  return { frame: 'complete', invocationId: invoke.invocationId, outcome, unitOfWork, recorded };
}

// One invocation in a host: parse, call the bound function, check the result, and hand back the unit of work. A
// failure discards the unit and carries the values generated since the last journaled write (ADR 0070).
export async function runInvocation(parts: RunParts): Promise<CompleteFrame> {
  const { invoke, extension, client } = parts;
  const state = new InvocationState(invoke);
  const values = new InvocationValues(invoke.recorded, parts.newId, parts.clock, !invoke.readOnly);
  const store = handlerStore(parts);
  try {
    const definition = extension.handlers.get(invoke.handler);
    if (definition === undefined) throw hostProblem(invoke.message, 'EXT_MANIFEST_INVALID', `${invoke.extension} binds no function for ${invoke.handler}`);
    const result = await definition.handle(inputOf(invoke, extension), createContext({ state, client, values, extension, store: store.store }));
    state.close();
    const outcome = outcomeOf(invoke, extension, state, result);
    return completeFrame(invoke, outcome, { writes: store.writes(), sends: state.sends, publishes: state.publishes, replies: state.replies }, noNewValues);
  } catch (error) {
    state.close();
    if (!(error instanceof ProblemError)) {
      void client.call(invoke.invocationId, { name: 'log', level: 'error', message: 'an unexpected error ended the handler', fields: { error: error instanceof Error ? error.name : typeof error } });
    }
    return completeFrame(invoke, { ok: false, problem: problemOfThrown(error, invoke.message) }, nothing, values.flush());
  }
}
