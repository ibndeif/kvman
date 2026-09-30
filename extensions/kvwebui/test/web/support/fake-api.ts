import { kernelQuerySchemas, z, type Json, type Problem, type Workspace } from '@kvman/sdk';
import ar from '../../../locales/ar.json';
import en from '../../../locales/en.json';

// A fake HTTP API for component tests: it answers the routes kvwebui calls (plan 04 §4.1) from a table of handlers,
// records every command and query with its workspace, and keeps settings and workspaces like the kernel does.

export type SettingInfo = z.output<(typeof kernelQuerySchemas)['kernel.settings.list']['output']>[number];
export type ExtensionInfo = z.output<(typeof kernelQuerySchemas)['kernel.extensions.list']['output']>[number];
export type Call = { kind: 'commands' | 'queries'; name: string; input: Json; workspaceId: string };
export type Handler = (input: Json, workspaceId: string) => Json | Promise<Json>;

/** Thrown by a handler to answer with a Problem. */
export class Failure extends Error {
  readonly problem: Problem;

  constructor(problem: Problem) {
    super(problem.message);
    this.problem = problem;
  }
}

export const fail = (code: string, params?: Record<string, Json>): never => {
  throw new Failure({ code, message: `${code} happened.`, ...(params === undefined ? {} : { params }) });
};

type SettingSpec = Omit<SettingInfo, 'value' | 'source'> & { preset?: Json; default?: Json };

const setting = (key: string, schema: Record<string, Json>, scopes: SettingInfo['scopes'], values: { preset?: Json; default?: Json }): SettingSpec => ({ key, description: `The English description of ${key}.`, schema, scopes, ...values });

export function baseSettings(home: string): SettingSpec[] {
  return [
    setting('kernel.language', { type: 'string' }, ['global'], { default: 'en' }),
    setting('kvwebui.title', { type: 'string' }, [], { default: 'kvwebui.title.default' }),
    setting('kvwebui.home', { type: 'string' }, [], { preset: home }),
    setting('kvwebui.nav.order', { type: 'array', items: { type: 'string' } }, ['global', 'workspace'], { default: [] }),
    setting('kvwebui.nav.hidden', { type: 'array', items: { type: 'string' } }, ['global', 'workspace'], { default: [] }),
    setting('kvwebui.theme', { type: 'string', enum: ['system', 'light', 'dark'] }, ['global'], { default: 'system' }),
  ];
}

export { setting };

export type FakeApi = {
  fetch: typeof fetch;
  calls: Call[];
  handlers: Map<string, Handler>;
  workspaces: Workspace[];
  extensions: ExtensionInfo[];
  settings: SettingSpec[];
  global: Map<string, Json>;
  perWorkspace: Map<string, Map<string, Json>>;
  catalogs: Record<string, Record<string, string>>;
  languages: string[];
  offline: boolean;
  callsTo(name: string): Call[];
};

const bodySchema = z.object({ input: z.json(), workspaceId: z.string() });

function envelope(data: Record<string, Json>): Response {
  return new Response(JSON.stringify({ ok: true, ...data }), { headers: { 'content-type': 'application/json' } });
}

function failure(problem: Problem): Response {
  return new Response(JSON.stringify({ ok: false, problem, jobId: '01900000-0000-7000-8000-000000000000' }), { headers: { 'content-type': 'application/json' } });
}

function resolved(api: FakeApi, spec: SettingSpec, workspaceId: string): SettingInfo {
  const inWorkspace = api.perWorkspace.get(workspaceId)?.get(spec.key);
  const global = api.global.get(spec.key);
  const { preset, default: fallback, ...info } = spec;
  if (inWorkspace !== undefined) return { ...info, value: inWorkspace, source: 'workspace' };
  if (global !== undefined) return { ...info, value: global, source: 'global' };
  if (preset !== undefined) return { ...info, value: preset, source: 'preset' };
  return { ...info, value: fallback ?? null, source: 'default' };
}

export function createFakeApi(options: { home?: string; extensions?: ExtensionInfo[]; settings?: SettingSpec[]; catalogs?: Record<string, Record<string, string>> } = {}): FakeApi {
  const api: FakeApi = {
    fetch: (async () => new Response()) as typeof fetch,
    calls: [],
    handlers: new Map(),
    workspaces: [{ id: 'home', name: 'ahmed', path: '/home/ahmed' }],
    extensions: options.extensions ?? [],
    settings: [...baseSettings(options.home ?? 'kvwebui.extensions'), ...(options.settings ?? [])],
    global: new Map(),
    perWorkspace: new Map(),
    catalogs: {
      en: { ...en, 'kernel.title': 'kvman', 'kernel.errors.VALIDATION_FAILED': "Something isn't valid.", 'kernel.errors.NOT_FOUND': "It wasn't found.", ...options.catalogs?.['en'] },
      ar: { ...en, ...ar, 'kernel.title': 'kvman', 'kernel.errors.VALIDATION_FAILED': 'شيء ما غير صالح.', 'kernel.errors.NOT_FOUND': 'لم يُعثر عليه.', ...options.catalogs?.['ar'] },
    },
    languages: ['en', 'ar'],
    offline: false,
    callsTo: (name) => api.calls.filter((call) => call.name === name),
  };
  installKernelHandlers(api);
  api.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    if (api.offline) throw new TypeError('Failed to fetch');
    const path = String(url);
    const locale = /^\/api\/locales\/(.+)$/.exec(path);
    if (locale !== null) {
      const catalog = api.catalogs[decodeURIComponent(locale[1] ?? '')];
      return catalog === undefined ? failure({ code: 'NOT_FOUND', message: 'No such language.' }) : envelope({ catalog });
    }
    const route = /^\/api\/(commands|queries)\/(.+)$/.exec(path);
    const kind = route?.[1] === 'commands' ? 'commands' : 'queries';
    const name = decodeURIComponent(route?.[2] ?? '');
    const body = bodySchema.parse(JSON.parse(String(init?.body)));
    api.calls.push({ kind, name, input: body.input, workspaceId: body.workspaceId });
    if (!api.workspaces.some((workspace) => workspace.id === body.workspaceId)) return failure({ code: 'NOT_FOUND', message: 'No such workspace.', params: { workspaceId: body.workspaceId } });
    const handler = api.handlers.get(name);
    if (handler === undefined) return failure({ code: 'NOT_FOUND', message: `No ${name}.` });
    return Promise.resolve()
      .then(() => handler(body.input, body.workspaceId))
      .then(
        (output) => envelope({ output, jobId: '01900000-0000-7000-8000-000000000001' }),
        (error: unknown) => {
          if (error instanceof Failure) return failure(error.problem);
          throw error;
        },
      );
  }) as typeof fetch;
  return api;
}

const settingSetSchema = z.object({ key: z.string(), value: z.json(), scope: z.enum(['global', 'workspace']) });

function installKernelHandlers(api: FakeApi): void {
  const record = (input: Json) => z.record(z.string(), z.json()).parse(input);
  api.handlers.set('kernel.health.get', () => ({ version: '0.1.0', preset: 'test', mode: 'web', workers: 1, uptimeMs: 1, languages: api.languages }));
  api.handlers.set('kernel.extensions.list', () => api.extensions);
  api.handlers.set('kernel.workspace.list', () => api.workspaces);
  api.handlers.set('kernel.settings.list', (_input, workspaceId) => api.settings.map((spec) => resolved(api, spec, workspaceId)));
  api.handlers.set('kernel.settings.set', (input, workspaceId) => {
    const { key, value, scope } = settingSetSchema.parse(input);
    if (scope === 'global') api.global.set(key, value);
    else api.perWorkspace.set(workspaceId, new Map([...(api.perWorkspace.get(workspaceId) ?? []), [key, value]]));
    return {};
  });
  api.handlers.set('kernel.settings.reset', (input, workspaceId) => {
    const { key, scope } = z.object({ key: z.string(), scope: z.enum(['global', 'workspace']) }).parse(input);
    if (scope === 'global') api.global.delete(key);
    else api.perWorkspace.get(workspaceId)?.delete(key);
    return {};
  });
  api.handlers.set('kernel.workspace.close', (input) => {
    const id = record(input)['workspaceId'];
    api.workspaces = api.workspaces.filter((workspace) => workspace.id !== id);
    return {};
  });
  api.handlers.set('kernel.secrets.list', () => []);
}
