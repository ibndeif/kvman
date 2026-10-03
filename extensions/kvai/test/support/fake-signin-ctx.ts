import { createModels, createProvider, type Api, type AuthContext, type CredentialStore, type Model, type Models, type OAuthAuth, type ProviderStreams } from '@earendil-works/pi-ai';
import { ProblemError, type Ctx, type CurrentJob, type Json, type Secrets, type Store, type Transaction } from '@kvman/sdk';
import type { LeaseClock } from '../../src/signin/credential-store.ts';

// A fake of the `Pick<Ctx, …>` the sign-in and the credential store ask for (QA 15): secrets and the global kv over
// two maps several fake jobs may share (that is how two workers are tested), a job with a fixed id and an
// AbortController's signal, progress chunks recorded in order, `cancel` aborting the controller of the job it names,
// and `problem` making a ProblemError. Nothing beyond what the production code calls.

// The maps two fake jobs share.
export type SharedSigninMaps = { secrets: Map<string, string>; kv: Map<string, Json>; controllers: Map<string, AbortController> };

export function makeSharedSigninMaps(): SharedSigninMaps {
  return { secrets: new Map(), kv: new Map(), controllers: new Map() };
}

// A LeaseClock whose `now()` is a number the test reads and whose `pause` advances it by `ms` and yields a
// macrotask (rejecting with `signal.reason` when aborted). No real timers.
export function makeFakeClock(start = 1_000_000): { clock: LeaseClock; current(): number } {
  let now = start;
  return {
    current: () => now,
    clock: {
      now: () => now,
      pause: async (ms: number, signal: AbortSignal): Promise<void> => {
        signal.throwIfAborted();
        now += ms;
        await new Promise<void>((resolve) => setImmediate(resolve));
        signal.throwIfAborted();
      },
    },
  };
}

export type FakeSigninCtx = {
  ctx: Pick<Ctx, 'secrets' | 'store' | 'job' | 'problem' | 'cancel'>;
  controller: AbortController;
  chunks: Json[];
};

export function makeFakeSigninCtx(jobId: string, shared: SharedSigninMaps): FakeSigninCtx {
  const controller = new AbortController();
  shared.controllers.set(jobId, controller);
  const chunks: Json[] = [];
  const transactionKv = {
    get: (key: string): Json | undefined => shared.kv.get(key),
    set: (key: string, value: Json): void => {
      shared.kv.set(key, value);
    },
    delete: (key: string): void => {
      shared.kv.delete(key);
    },
  };
  const store = {
    global: {
      kv: {
        get: (key: string): Promise<Json | undefined> => Promise.resolve(shared.kv.get(key)),
        set: (key: string, value: Json): Promise<void> => {
          shared.kv.set(key, value);
          return Promise.resolve();
        },
        delete: (key: string): Promise<void> => {
          shared.kv.delete(key);
          return Promise.resolve();
        },
      },
    },
    transaction: <Result>(fn: (tx: Transaction) => Result): Promise<Result> =>
      Promise.resolve(fn({ global: { kv: transactionKv } } as unknown as Transaction)),
  } as unknown as Store;
  const secrets: Secrets = {
    get: (name: string): Promise<string | undefined> => Promise.resolve(shared.secrets.get(name)),
    set: (name: string, value: string): Promise<void> => {
      shared.secrets.set(name, value);
      return Promise.resolve();
    },
    delete: (name: string): Promise<void> => {
      shared.secrets.delete(name);
      return Promise.resolve();
    },
  };
  const job: CurrentJob = {
    id: jobId,
    rootId: jobId,
    workspace: { id: 'home', name: 'home', path: '/fake-home' },
    caller: { kind: 'user' },
    signal: controller.signal,
    progress: (data: Json): void => {
      chunks.push(data);
    },
  };
  return {
    ctx: {
      secrets,
      store,
      job,
      problem: (code: string, params?: Readonly<Record<string, Json>>): ProblemError =>
        new ProblemError({ code, message: code, ...(params === undefined ? {} : { params }) }),
      cancel: (cancelledId: string): Promise<void> => {
        shared.controllers.get(cancelledId)?.abort();
        return Promise.resolve();
      },
    },
    controller,
    chunks,
  };
}

// pi-ai's auth context without ambience: no environment variable and no file for any name (ADR 0009, 227).
export const noAmbientAuth: AuthContext = { env: () => Promise.resolve(undefined), fileExists: () => Promise.resolve(false) };

// Streams no sign-in test calls: `login` is the whole flow.
const uncalledStreams: ProviderStreams = {
  stream: () => {
    throw new Error('signin tests never stream');
  },
  streamSimple: () => {
    throw new Error('signin tests never stream');
  },
};

export function makeSigninOauth(login: OAuthAuth['login'], refresh?: OAuthAuth['refresh']): OAuthAuth {
  return {
    name: 'Fake plan',
    login,
    refresh: refresh ?? ((credential) => Promise.resolve(credential)),
    toAuth: (credential) => Promise.resolve({ apiKey: credential.access }),
  };
}

// A `Models` with one fake OAuth provider, reading its credentials from `store`.
export function makeSigninModels(provider: string, oauth: OAuthAuth, store: CredentialStore, api: ProviderStreams = uncalledStreams): { models: Models; model: Model<Api> } {
  const chatModel: Model<Api> = {
    id: 'm1',
    name: 'M1',
    api: 'fake-chat',
    provider,
    baseUrl: 'https://127.0.0.1:1/',
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    reasoning: false,
    contextWindow: 1024,
    maxTokens: 256,
  };
  const models = createModels({ credentials: store, authContext: noAmbientAuth });
  models.setProvider(createProvider({ id: provider, name: 'Fake plan provider', auth: { oauth }, models: [chatModel], api }));
  return { models, model: chatModel };
}

// Waits until `check()` holds, one macrotask at a time; throws instead of passing vaguely when it never does.
export async function untilSeen(check: () => boolean, label: string): Promise<void> {
  for (let round = 0; round < 1000; round += 1) {
    if (check()) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error(`never saw ${label}`);
}
