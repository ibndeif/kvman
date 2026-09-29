import {
  commandOptionsSchema, jsonObjectSchema, jsonSchema, liveChunkSchema, outboundPublishSchema, outboundSendSchema, ulidSchema,
  type Json, type LiveChunk, type Manifest, type RpcResult,
} from '@kvman/protocol';
import type { CommandOptions, CommandRef, Ctx, Deferred, InputOf, Logger, OutputOf, QueryRef } from '@kvman/sdk';
import type { ExtensionRecording } from '../../extension/record-extension.ts';
import { ProblemError } from '../../problems.ts';
import { extensionProblem, hostProblem } from './host-problems.ts';
import type { InvocationState } from './invocation-state.ts';
import type { InvocationValues } from './invocation-values.ts';
import type { RpcClient } from './rpc-client.ts';

export type MessagingParts = { state: InvocationState; client: RpcClient; values: InvocationValues; extension: ExtensionRecording };

type Messaging = Pick<Ctx, 'command' | 'send' | 'query' | 'publish' | 'live' | 'defer' | 'reply' | 'problem' | 'log'>;

type Checked<Value> = { success: true; data: Value } | { success: false; error: { issues: ReadonlyArray<{ path: PropertyKey[]; message: string }> } };

function ownLiveEvent(manifest: Manifest, type: string): Extract<Manifest['types'][number], { kind: 'event' }> | undefined {
  const entry = manifest.types.find((candidate) => candidate.type === type);
  return entry?.kind === 'event' && entry.delivery === 'live' ? entry : undefined;
}

function chunkFits(chunk: LiveChunk, declared: 'text' | 'value' | 'data' | undefined): boolean {
  if ('reset' in chunk) return false;
  if (declared === 'value') return 'value' in chunk;
  if (declared === 'data') return 'data' in chunk;
  return 'text' in chunk;
}

// ctx's messaging members (05 §5.4): calls that wait go to the kernel at once; sends, publishes, and replies wait in
// the unit of work; misuse is refused here with the codes of ADR 0074 before anything is framed.
export function createMessaging({ state, client, values, extension }: MessagingParts): Messaging {
  const { invoke } = state;
  const { message } = invoke;
  const valid = <Value>(checked: Checked<Value>, what: string): Value => {
    if (checked.success) return checked.data;
    throw hostProblem(message, 'VALIDATION_FAILED', `the ${what} is not valid`, checked.error.issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message })));
  };
  const answer = (result: RpcResult): Json | undefined => {
    if (!result.ok) throw new ProblemError(result.problem);
    return result.value;
  };
  const log = (level: 'debug' | 'info' | 'warn' | 'error') => (text: string, fields?: Json): void => {
    state.open();
    const checked = fields === undefined ? undefined : valid(jsonObjectSchema.safeParse(fields), 'log fields');
    void client.call(invoke.invocationId, { name: 'log', level, message: String(text), ...(checked === undefined ? {} : { fields: checked }) });
  };
  const logger: Logger = { debug: log('debug'), info: log('info'), warn: log('warn'), error: log('error') };

  function commandCall<Ref extends CommandRef>(type: Ref, payload: InputOf<Ref>, options?: CommandOptions): Promise<OutputOf<Ref>>;
  function commandCall<Result = Json>(type: string, payload: Json, options?: CommandOptions): Promise<Result>;
  async function commandCall(type: string, payload: unknown, options: CommandOptions = {}): Promise<unknown> {
    state.writable('command');
    const call = {
      name: 'command' as const, type, payload: valid(jsonSchema.safeParse(payload), 'payload'),
      options: valid(commandOptionsSchema.safeParse(options), 'options'), ordinal: state.nextCommandOrdinal(), recorded: values.flush(),
    };
    return answer(await client.call(invoke.invocationId, call));
  }

  function queryCall<Ref extends QueryRef>(type: Ref, payload: InputOf<Ref>): Promise<OutputOf<Ref>>;
  function queryCall<Result = Json>(type: string, payload: Json): Promise<Result>;
  async function queryCall(type: string, payload: unknown): Promise<unknown> {
    state.open();
    const call = { name: 'query' as const, type, payload: valid(jsonSchema.safeParse(payload), 'payload') };
    return answer(await client.call(invoke.invocationId, call));
  }

  return {
    command: commandCall,
    send(type: string, payload: unknown, options: object = {}): void {
      state.writable('send');
      state.sends.push(valid(outboundSendSchema.safeParse({ ...options, type, payload }), 'send'));
    },
    query: queryCall,
    publish(type: string, payload: unknown): void {
      state.writable('publish');
      state.publishes.push(valid(outboundPublishSchema.safeParse({ type, payload }), 'publish'));
    },
    live(type, key, chunk) {
      state.writable('live');
      const event = ownLiveEvent(extension.manifest, type);
      if (event === undefined) throw hostProblem(message, 'CAPABILITY_DENIED', `"${type}" is not a live event of ${invoke.extension}`);
      const checked = valid(liveChunkSchema.safeParse(chunk), 'live chunk');
      if (!chunkFits(checked, event.chunk)) throw hostProblem(message, 'VALIDATION_FAILED', `"${type}" streams ${event.chunk ?? 'text'} chunks`);
      void client.call(invoke.invocationId, { name: 'live', type, key: String(key), chunk: checked });
    },
    defer(options = {}): Deferred {
      state.writable('defer');
      if (invoke.kind !== 'command') throw hostProblem(message, 'VALIDATION_FAILED', 'only a command handler defers its reply');
      const { onAbort } = options;
      const target = extension.manifest.types.find((entry) => entry.type === onAbort);
      if (onAbort !== undefined && (target?.kind !== 'command' || target.access !== 'internal')) {
        throw hostProblem(message, 'VALIDATION_FAILED', `onAbort "${onAbort}" is not an internal command of ${invoke.extension}`);
      }
      const marker: Deferred = Object.freeze({ deferred: true });
      state.deferral = { marker, onAbort };
      return marker;
    },
    reply(commandId, result) {
      state.writable('reply');
      const id = valid(ulidSchema.safeParse(commandId), 'command id');
      state.replies.push({
        commandId: id,
        payload: result instanceof ProblemError ? { ok: false, problem: result.problem } : { ok: true, value: valid(jsonSchema.safeParse(result), 'reply') },
      });
    },
    problem(code, options) {
      state.open();
      return new ProblemError(extensionProblem(extension.manifest, message, code, options));
    },
    log: logger,
  };
}
