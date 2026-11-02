import { onMounted } from 'vue';
import type { Kvman } from '@kvman/sdk/web';
import { toastProblem } from './kvman.ts';
import type { CommandOwner, CommandOwners } from './live-step.ts';

// Who registered each connector command (plan 08 §8.4; ADR 0115, 46 and 54), read once when the conversation mounts, so
// a running call shows the progress of its own extension only: the owner, and the namespace of its command's job.
// A failed read shows its Problem, and no call shows progress.
export function useCommandOwners(kvman: Kvman): CommandOwners {
  const owners = new Map<string, CommandOwner>();
  onMounted(async () => {
    try {
      for (const connector of await kvman.exec('kvcoder.connector.list', {})) {
        for (const command of connector.commands ?? []) owners.set(`${connector.name} ${command.name}`, { owner: connector.owner, namespace: command.command.split('.')[0] ?? '' });
      }
    } catch (error) {
      toastProblem(kvman, error);
    }
  });
  return (connector, command) => owners.get(`${connector} ${command}`);
}
