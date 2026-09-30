import { envelopeSchema, healthSchema, ProblemError, workspaceSchema, z, type Json, type Workspace } from '@kvman/sdk';
import type { Lock } from './lock-file.ts';

// Handing the start folder to the kvman that holds the lock (plan 01 §1.2, ADR 0009, 43–44): it must be listening and
// answering, and every flag given (`--preset` by its preset's name, `--mode`) must match what it runs.

export type GivenFlags = { preset: string | undefined; mode: 'web' | undefined };

function running(lock: Lock, message: string, params: Record<string, Json> = {}): ProblemError {
  return new ProblemError({ code: 'KVMAN_RUNNING', message, params: { pid: lock.pid, ...params } });
}

async function call<Output>(lock: Lock, port: number, route: string, input: Json, output: z.ZodType<Output>): Promise<Output> {
  let response: Response;
  try {
    response = await fetch(`http://127.0.0.1:${String(port)}/api/${route}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input }),
    });
  } catch {
    throw running(lock, `Another kvman (pid ${String(lock.pid)}) holds this home's lock, but it doesn't answer on port ${String(port)}.`, { port });
  }
  const answer = envelopeSchema({ output, jobId: z.string() }).parse(await response.json());
  if (!answer.ok) throw new ProblemError(answer.problem);
  return answer.output;
}

function checkFlags(lock: Lock, health: z.infer<typeof healthSchema>, given: GivenFlags): void {
  if (given.preset !== undefined && given.preset !== health.preset) {
    throw running(lock, `Another kvman (pid ${String(lock.pid)}) runs the preset ${health.preset} on this home, not ${given.preset}.`, { preset: health.preset });
  }
  if (given.mode !== undefined && given.mode !== health.mode) {
    throw running(lock, `Another kvman (pid ${String(lock.pid)}) runs in ${health.mode} mode on this home, not ${given.mode}.`, { mode: health.mode });
  }
}

// Opens `folder` in the running kvman and returns its workspace and port.
export async function handOver(lock: Lock, folder: string, given: GivenFlags): Promise<{ port: number; workspace: Workspace }> {
  const port = lock.port;
  if (port === undefined) throw running(lock, `Another kvman (pid ${String(lock.pid)}) is still starting on this home.`);
  const health = await call(lock, port, 'queries/kernel.health.get', {}, healthSchema);
  checkFlags(lock, health, given);
  const workspace = await call(lock, port, 'commands/kernel.workspace.open', { path: folder }, workspaceSchema);
  return { port, workspace };
}
