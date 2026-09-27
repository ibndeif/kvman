import { processResultSchema, spawnOptionsSchema, spawnResultSchema, ulidSchema, type Json, type RpcCall, type RpcResult } from '@kvman/protocol';
import type { ProcessHandle, Processes } from '@kvman/sdk';
import { ProblemError } from '../../problems.ts';
import type { FilesParts } from './context-files.ts';
import { hostProblem } from './host-problems.ts';

// ctx.process (03 §3.7, ADR 0139): the kernel spawns, supervises, and kills; the handle only asks it. Options are
// checked here first, so a mistake is the handler's VALIDATION_FAILED, not a frame the kernel refuses.
type Checked<Value> = { success: true; data: Value } | { success: false; error: { issues: ReadonlyArray<{ path: PropertyKey[]; message: string }> } };

export function createProcesses({ state, client }: FilesParts): Processes {
  const { invoke } = state;
  const valid = <Value>(checked: Checked<Value>, what: string): Value => {
    if (checked.success) return checked.data;
    throw hostProblem(invoke.message, 'VALIDATION_FAILED', `the ${what} is not valid`, checked.error.issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message })));
  };
  const call = async (rpc: RpcCall): Promise<Json | undefined> => {
    state.open();
    const result: RpcResult = await client.call(invoke.invocationId, rpc);
    if (!result.ok) throw new ProblemError(result.problem);
    return result.value;
  };
  const kill = async (processId: string): Promise<void> => {
    await call({ name: 'process.kill', processId: valid(ulidSchema.safeParse(processId), 'process id') });
  };
  const handle = (processId: string): ProcessHandle => ({
    processId,
    wait: async () => processResultSchema.parse(await call({ name: 'process.wait', processId })),
    kill: () => kill(processId),
  });
  return {
    spawn: async (options) => {
      const checked = valid(spawnOptionsSchema.safeParse(options), 'spawn options');
      return handle(spawnResultSchema.parse(await call({ name: 'process.spawn', options: checked })).processId);
    },
    kill,
  };
}
