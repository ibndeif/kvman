import type { Kvman } from '@kvman/sdk/web';
import { computed, onMounted, ref, watch } from 'vue';
import { problemOf, stringValues, toastProblem, type ShownProblem } from './kvman.ts';
import { kvcoderPackage, secretPrefix, serverEntries, type McpServerEntry } from './mcp-server-entry.ts';
import { useSetting } from './use-setting.ts';

// The MCP servers of kvcoder's configuration (plan 08 §8.7, ADR 0020, 9, 14, and 15): the list is the setting
// `kvcoder.mcp.servers`, written in the scope the extension's page is set to; a server's values are kvcoder's secrets,
// of which only the names are ever read; and each server's state is checked, not stored.

export type ServerState = { status: 'checking' } | { status: 'ready'; tools: number } | { status: 'signInNeeded' } | { status: 'failed'; problem: ShownProblem | undefined };

export type SecretChanges = { set: Record<string, string>; remove: string[] };

export function useMcpServers(kvman: Kvman) {
  const setting = useSetting(kvman, 'kvcoder.mcp.servers');
  const servers = computed(() => serverEntries(setting.value.value));
  const states = ref<Record<string, ServerState>>({});
  const secrets = ref<string[]>([]);
  const working = ref(false);
  // A server being saved is checked once its secrets are stored, not when the list first shows it.
  const beingSaved = new Set<string>();

  const loadSecrets = async (): Promise<void> => {
    secrets.value = (await kvman.exec('kernel.secrets.list', {})).filter((secret) => secret.extension === kvcoderPackage).map((secret) => secret.name);
  };

  async function check(name: string): Promise<void> {
    states.value = { ...states.value, [name]: { status: 'checking' } };
    let state: ServerState;
    try {
      const answer = await kvman.exec('kvcoder.mcp.server.check', { name });
      state = answer.status === 'failed' ? { status: 'failed', problem: { code: answer.problem.code, params: stringValues(answer.problem.params) } } : answer;
    } catch (error) {
      state = { status: 'failed', problem: problemOf(error) };
    }
    states.value = { ...states.value, [name]: state };
  }

  const checkAll = (): Promise<void[]> => Promise.all(servers.value.map((server) => check(server.name)));

  // A change is tried as a whole: the first step that fails is toasted and the rest don't run.
  async function attempt(steps: () => Promise<boolean>): Promise<boolean> {
    working.value = true;
    try {
      return await steps();
    } catch (error) {
      toastProblem(kvman, error);
      return false;
    } finally {
      working.value = false;
    }
  }

  const deleteSecrets = async (names: readonly string[]): Promise<void> => {
    for (const name of names) await kvman.exec('kernel.secrets.delete', { extension: kvcoderPackage, name });
  };

  /** Stores a server: the list, then its new values, then the secrets it no longer names; then checks it. */
  const save = (entry: McpServerEntry, changes: SecretChanges): Promise<boolean> =>
    attempt(async () => {
      const others = servers.value.filter((server) => server.name !== entry.name);
      const index = servers.value.findIndex((server) => server.name === entry.name);
      const list = index < 0 ? [...others, entry] : [...servers.value.slice(0, index), entry, ...servers.value.slice(index + 1)];
      beingSaved.add(entry.name);
      try {
        if (!(await setting.set(list))) return false;
        for (const [name, value] of Object.entries(changes.set)) await kvman.exec('kernel.secrets.set', { extension: kvcoderPackage, name, value });
        await deleteSecrets(changes.remove);
        await loadSecrets();
      } finally {
        beingSaved.delete(entry.name);
      }
      void check(entry.name);
      return true;
    });

  /** Removes a server and every secret of its. */
  const remove = (name: string): Promise<boolean> =>
    attempt(async () => {
      if (!(await setting.set(servers.value.filter((server) => server.name !== name)))) return false;
      await deleteSecrets(secrets.value.filter((secret) => secret.startsWith(secretPrefix(name))));
      await loadSecrets();
      return true;
    });

  onMounted(async () => {
    try {
      await loadSecrets();
    } catch (error) {
      toastProblem(kvman, error);
    }
  });
  // The list as stored decides what is checked: when it is read, and whenever the scope or workspace gives another.
  watch(servers, (now, before) => {
    const known = new Set((before ?? []).map((server) => server.name));
    for (const server of now) if (!beingSaved.has(server.name) && (!known.has(server.name) || !(server.name in states.value))) void check(server.name);
  });
  watch(() => kvman.workspace.value.id, checkAll);

  return { servers, states, secrets, locked: setting.locked, changed: setting.changed, working: computed(() => working.value || setting.saving.value), save, remove, reset: setting.reset, check };
}
