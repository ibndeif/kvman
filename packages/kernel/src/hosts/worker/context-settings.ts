import { configWriteScopeSchema, jsonObjectSchema, secretNameSchema, secretValueSchema, type JsonObject, type RpcResult } from '@kvman/protocol';
import type { ConfigAccess, ConfigScope, SecretAccess } from '@kvman/sdk';
import { ProblemError } from '../../problems.ts';
import { hostProblem } from './host-problems.ts';
import type { InvocationState } from './invocation-state.ts';
import type { RpcClient } from './rpc-client.ts';

export type SettingsParts = { state: InvocationState; client: RpcClient };

type Checked<Value> = { success: true; data: Value } | { success: false; error: { issues: ReadonlyArray<{ path: PropertyKey[]; message: string }> } };

// ctx.config and ctx.secrets (05 §5.8, ADRs 0125, 0126): reads see the handler's own pending sets first; sets wait in
// the unit of work, config for the commit and secrets for after it.
export function createSettings({ state, client }: SettingsParts): { config: ConfigAccess; secrets: SecretAccess } {
  const { invoke } = state;
  const { message } = invoke;
  const valid = <Value>(checked: Checked<Value>, what: string): Value => {
    if (checked.success) return checked.data;
    throw hostProblem(message, 'VALIDATION_FAILED', `the ${what} is not valid`, checked.error.issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message })));
  };
  const answer = (result: RpcResult): RpcResult & { ok: true } => {
    if (!result.ok) throw new ProblemError(result.problem);
    return result;
  };
  const pendingConfig = (scope: ConfigScope): JsonObject | undefined => state.config.findLast((write) => write.scope === scope)?.value;

  function getConfig<Config extends JsonObject = JsonObject>(): Promise<Config>;
  async function getConfig(): Promise<JsonObject> {
    state.open();
    const global = pendingConfig('global');
    const workspace = pendingConfig('workspace');
    const pending = { ...(global === undefined ? {} : { global }), ...(workspace === undefined ? {} : { workspace }) };
    return jsonObjectSchema.parse(answer(await client.call(invoke.invocationId, { name: 'config.get', pending })).value);
  }

  const config: ConfigAccess = {
    get: getConfig,
    set: (scope, value) => {
      state.writable('config.set');
      const checkedScope = valid(configWriteScopeSchema.safeParse(scope), 'config scope');
      if (checkedScope === 'workspace' && message.workspaceId === undefined) {
        throw hostProblem(message, 'WORKSPACE_INVALID', 'this handler has no workspace, so it has no workspace config');
      }
      state.config.push({ scope: checkedScope, value: valid(jsonObjectSchema.safeParse(value), 'config value') });
    },
  };

  const secrets: SecretAccess = {
    get: async (name) => {
      state.open();
      const checkedName = valid(secretNameSchema.safeParse(name), 'secret name');
      const pending = state.secrets.findLast((write) => write.name === checkedName);
      if (pending !== undefined) return pending.value ?? undefined;
      const { value } = answer(await client.call(invoke.invocationId, { name: 'secret.get', secret: checkedName }));
      return typeof value === 'string' ? value : undefined;
    },
    set: (name, value) => {
      state.writable('secrets.set');
      const checkedName = valid(secretNameSchema.safeParse(name), 'secret name');
      state.secrets.push({ name: checkedName, value: value === null ? null : valid(secretValueSchema.safeParse(value), 'secret value') });
    },
  };
  return { config, secrets };
}
