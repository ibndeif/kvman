import { rm } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { join, sep } from 'node:path';
import { workspaceForgetRequestSchema } from '@kvman/protocol';
import type { FaultPoints } from '../faults/fault-points.ts';
import type { RegistryState } from '../registry/registry-state.ts';
import type { WorkspaceDirectory } from '../registry/workspace-directory.ts';
import type { Claim } from '../scheduler/dispatcher.ts';
import type { Scheduler } from '../scheduler/scheduler.ts';
import type { SchedulerTimers } from '../scheduler/timers.ts';
import type { CommitPipeline } from '../storage/commit-pipeline.ts';
import type { CommitResult } from '../storage/commit-unit.ts';
import type { Connection } from '../storage/driver.ts';
import { isAdministrator } from './administrators.ts';
import { parsed, refusal } from './command-payloads.ts';
import { KernelStopping } from './extension-commands.ts';
import type { KernelCommits } from './kernel-commits.ts';
import type { KernelLogger } from './kernel-logger.ts';
import type { SerialChanges } from './serial-changes.ts';
import { readWorkspace, readWorkspaceKind } from './workspace-rows.ts';

export type WorkspaceForgettingDeps = {
  connection: Connection;
  pipeline: CommitPipeline;
  commits: KernelCommits;
  scheduler: Scheduler;
  registry: RegistryState;
  directory: WorkspaceDirectory;
  serial: SerialChanges;
  timers: SchedulerTimers;
  faults: FaultPoints;
  abortMessages: (messageIds: ReadonlySet<string>) => void;
  // Kills the workspace's processes and resolves once their ends and onExit commands committed (ADR 0139).
  killProcesses: (workspaceId: string) => Promise<void>;
  home: string;
  logger: KernelLogger;
};

// 04 §4.4 step 2: the cancelled work, onAbort commands included, gets this long to settle before it is aborted.
export const forgetSettleMs = 10_000;

// kernel.workspace.forget in the order of 04 §4.4 (ADR 0122): stop admitting, cancel and wait, then delete every row
// of the workspace in one transaction. A forget stopped by shutdown runs again at the next start.
export class WorkspaceForgetting {
  readonly #deps: WorkspaceForgettingDeps;

  constructor(deps: WorkspaceForgettingDeps) {
    this.#deps = deps;
  }

  async forget(claim: Claim, signal: AbortSignal): Promise<void> {
    const { message } = claim;
    const request = parsed(workspaceForgetRequestSchema, message);
    if (!request.ok) return this.#deps.commits.fail(claim, request.problem);
    const { workspaceId } = request.value;
    const workspace = readWorkspace(this.#deps.connection, workspaceId);
    if (workspace === undefined) return this.#deps.commits.fail(claim, refusal(message, 'WORKSPACE_INVALID', { detail: `no workspace ${workspaceId} exists` }));
    // 07 §7.1, ADR 0150: a person may forget any workspace; an extension with kernel.admin only a preview.
    const preview = readWorkspaceKind(this.#deps.connection, workspaceId) === 'preview';
    if (!this.#allowed(message, preview)) {
      return this.#deps.commits.fail(claim, refusal(message, 'CALLER_NOT_ALLOWED', { detail: `only a person may forget workspace ${workspaceId}`, hint: 'an extension with kernel.admin may forget a preview workspace' }));
    }
    if (this.#deps.directory.stateOf(workspaceId) === 'forgetting') {
      return this.#deps.commits.fail(claim, refusal(message, 'WORKSPACE_INVALID', { detail: `workspace ${workspaceId} is being forgotten` }));
    }
    this.#deps.directory.beginForgetting(workspaceId);
    try {
      const cancelled = await this.#deps.commits.commitUnclaimed({
        origin: { kind: 'change', change: { kind: 'workspace.cancel', workspaceId, except: message.id }, correlationId: message.correlationId },
        writes: [], sends: [], publishes: [], replies: [],
      });
      if (!cancelled.committed) return await this.#deps.commits.fail(claim, cancelled.problem);
      this.#ended(workspaceId, cancelled);
      await this.#deps.killProcesses(workspaceId);
      this.#deps.faults.reach('workspace.forget.after-cancel');
      await this.#settled(workspaceId, message.id, signal);
      await this.#deps.serial.run(() => this.#delete(claim, workspaceId, workspace.path, preview));
    } finally {
      this.#deps.directory.endForgetting(workspaceId);
    }
  }

  #allowed(message: Claim['message'], preview: boolean): boolean {
    if (message.source === 'kernel' || message.source.startsWith('user:')) return true;
    return preview && isAdministrator(this.#deps.registry, message);
  }

  async #delete(claim: Claim, workspaceId: string, path: string, preview: boolean): Promise<void> {
    const { message } = claim;
    const change = { kind: 'workspace.forget', workspaceId } as const;
    const result = await this.#deps.commits.commit({ origin: { kind: 'change', change, command: message, correlationId: message.correlationId }, writes: [], sends: [], publishes: [], replies: [] }, claim);
    if (!result.committed) return;
    this.#ended(workspaceId, result);
    this.#deps.registry.refresh();
    if (preview) await this.#deletePreviewFolder(message, workspaceId, path);
  }

  // 07 §7.1, ADR 0150: a forgotten preview's folder goes after its unit commits, and only when it is still under
  // the home folder's previews. Anything else is left alone with a warning.
  async #deletePreviewFolder(message: Claim['message'], workspaceId: string, path: string): Promise<void> {
    const canonical = existingRealPath(path);
    if (canonical === undefined) return;
    const previews = join(realpathSync.native(this.#deps.home), 'previews');
    if (!canonical.startsWith(`${previews}${sep}`)) {
      this.#deps.logger.write({ level: 'warn', message: 'not deleting a preview workspace folder outside previews', fields: {}, attributes: { correlationId: message.correlationId, messageId: message.id, workspaceId } });
      return;
    }
    await rm(canonical, { recursive: true, force: true });
  }

  // Running invocations of what the unit ended are aborted, and the workspace's unstored deliveries dropped.
  #ended(workspaceId: string, result: Extract<CommitResult, { committed: true }>): void {
    const ended = new Set(result.ended.map((entry) => entry.messageId));
    const unstored = this.#deps.scheduler.unstoredInWorkspace(workspaceId);
    this.#deps.abortMessages(new Set([...ended, ...unstored]));
    this.#deps.scheduler.forget(ended);
    this.#deps.scheduler.dropUnstored(unstored);
  }

  // Until no message of the workspace but the forget itself is unfinished, checked after every commit, or the settle
  // time passed.
  #settled(workspaceId: string, forgetId: string, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const finish = (): void => {
        timer.cancel();
        stopObserving();
        signal.removeEventListener('abort', stopped);
      };
      const check = (): void => {
        if (this.#unfinished(workspaceId, forgetId) > 0) return;
        finish();
        resolve();
      };
      const stopped = (): void => {
        finish();
        reject(new KernelStopping());
      };
      const timer = this.#deps.timers.set(forgetSettleMs, () => {
        finish();
        resolve();
      });
      const stopObserving = this.#deps.pipeline.observe(check);
      signal.addEventListener('abort', stopped);
      if (signal.aborted) stopped();
      else check();
    });
  }

  #unfinished(workspaceId: string, forgetId: string): number {
    const row = this.#deps.connection
      .prepare(`SELECT COUNT(*) AS count FROM messages WHERE workspace_id = ? AND state IN ('pending', 'running', 'awaiting') AND id != ?`)
      .get(workspaceId, forgetId);
    return Number(row?.['count'] ?? 0);
  }
}

// A path's canonical form, or undefined when nothing is there any more.
function existingRealPath(path: string): string | undefined {
  try {
    return realpathSync.native(path);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
    throw error;
  }
}
