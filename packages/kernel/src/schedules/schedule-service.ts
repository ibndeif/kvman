import type { KernelLogger } from '../hosts/kernel-logger.ts';
import type { RegistryState } from '../registry/registry-state.ts';
import type { WorkspaceDirectory } from '../registry/workspace-directory.ts';
import type { CommitPipeline } from '../storage/commit-pipeline.ts';
import type { AppliedMessages } from '../storage/commit-unit.ts';
import type { Connection } from '../storage/driver.ts';
import type { DesiredRun } from '../storage/schedule-changes.ts';
import type { UlidGenerator } from '../ulid.ts';

export type ScheduleServiceDeps = { connection: Connection; pipeline: CommitPipeline; registry: RegistryState; workspaces: WorkspaceDirectory; ids: UlidGenerator; logger: KernelLogger };

// ADR 0144: the runs every enabled, unquarantined extension's schedules want: one per enabled workspace, or one
// without a workspace ('') for a global command while the extension is enabled somewhere. A workspace being forgotten
// wants none (04 §4.4).
function desiredRuns(registry: RegistryState, directory: WorkspaceDirectory): DesiredRun[] {
  const current = registry.current();
  const workspaces = new Map<string, string[]>();
  for (const [workspaceId, names] of registry.enabled()) {
    if (directory.stateOf(workspaceId) !== 'open') continue;
    for (const name of names) workspaces.set(name, [...(workspaces.get(name) ?? []), workspaceId]);
  }
  return current.listed(undefined).flatMap((manifest) => {
    const enabledIn = workspaces.get(manifest.meta.name) ?? [];
    if (enabledIn.length === 0) return [];
    return manifest.schedules.flatMap((entry) => {
      const command = manifest.types.find((type) => type.type === entry.command);
      const global = command?.kind === 'command' && command.scope === 'global';
      return (global ? [''] : enabledIn).map((ws) => ({ extension: manifest.meta.name, name: entry.name, ws, entry }));
    });
  });
}

// Keeps the `schedules` rows equal to the desired runs: after every registry rebuild (enable, disable, reload,
// quarantine, uninstall, forget), when a run's message ends, and at boot. Reconciles run one at a time; a request
// during one runs once more after it.
export class ScheduleService {
  readonly #deps: ScheduleServiceDeps;
  #outstanding = new Set<string>();
  #running: Promise<void> | undefined;
  #again = false;
  #stopped = false;

  constructor(deps: ScheduleServiceDeps) {
    this.#deps = deps;
  }

  // Boot (03 §3.9 step 6): rows whose message ended or vanished while the kernel was down get their next run.
  async start(): Promise<void> {
    this.#deps.registry.onRefresh(() => this.request());
    this.#deps.pipeline.observe((applied) => this.#committed(applied));
    this.request();
    await this.settled();
  }

  // No reconcile starts after stop; the one running finishes before the database closes.
  stop(): Promise<void> {
    this.#stopped = true;
    return this.settled();
  }

  request(): void {
    if (this.#stopped) return;
    if (this.#running !== undefined) {
      this.#again = true;
      return;
    }
    this.#running = this.#reconcile().finally(() => {
      this.#running = undefined;
      if (this.#again) {
        this.#again = false;
        this.request();
      }
    });
  }

  async settled(): Promise<void> {
    while (this.#running !== undefined) await this.#running;
  }

  #committed(applied: AppliedMessages): void {
    if (applied.replies.some((reply) => this.#outstanding.has(reply.messageId))) this.request();
  }

  async #reconcile(): Promise<void> {
    const { connection, registry, pipeline, ids, logger } = this.#deps;
    const current = registry.current();
    const paused = connection.prepare('SELECT DISTINCT extension FROM schedules').all().map((row) => String(row['extension'])).filter((name) => current.isQuarantined(name));
    const correlationId = ids.next();
    const result = await pipeline.enqueue({
      origin: { kind: 'change', change: { kind: 'schedules.reconcile', desired: desiredRuns(registry, this.#deps.workspaces), paused }, correlationId }, writes: [], sends: [], publishes: [], replies: [],
    });
    if (!result.committed) logger.write({ level: 'error', message: 'the schedules could not be reconciled', fields: { code: result.problem.code }, attributes: { correlationId } });
    this.#outstanding = new Set(connection.prepare('SELECT message_id FROM schedules WHERE message_id IS NOT NULL').all().map((row) => String(row['message_id'])));
  }
}
