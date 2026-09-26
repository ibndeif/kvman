import { mkdirSync } from 'node:fs';
import { kernelProblem, ProblemError } from '../problems.ts';
import { checkFolder } from '../workspaces/workspace-paths.ts';
import type { KernelRuntime } from './kernel-runtime.ts';

function created(path: string, correlationId: string): void {
  try {
    mkdirSync(path, { recursive: true, mode: 0o755 });
  } catch (error) {
    if (!(error instanceof Error && 'code' in error)) throw error;
    throw new ProblemError(kernelProblem('WORKSPACE_INVALID', { correlationId, detail: `the Home folder ${path} cannot be created (${String(error.code)})` }));
  }
}

// 03 §3.9 first run, 07 §7.1, ADR 0127: the Home folder is created and opened as a workspace like any folder; a
// failure fails the first run.
export async function openHomeWorkspace(runtime: KernelRuntime, path: string, kvmanHome: string, correlationId: string): Promise<void> {
  created(path, correlationId);
  const checked = checkFolder(path, kvmanHome);
  if (!checked.ok) throw new ProblemError(kernelProblem(checked.code, { correlationId, detail: checked.detail }));
  const result = await runtime.pipeline.enqueue({
    origin: { kind: 'change', change: { kind: 'workspace.open', ...checked.folder }, correlationId }, writes: [], sends: [], publishes: [], replies: [],
  });
  if (!result.committed) throw new ProblemError(result.problem);
}
