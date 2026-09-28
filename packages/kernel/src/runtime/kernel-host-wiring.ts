import type { HealthResult, QuarantineReason } from '@kvman/protocol';
import { ExtensionQueries } from '../hosts/extension-queries.ts';
import type { ExtensionVersions } from '../hosts/extension-versions.ts';
import { InspectionQueries } from '../hosts/inspection-queries.ts';
import type { KernelCommits } from '../hosts/kernel-commits.ts';
import type { KernelLogger } from '../hosts/kernel-logger.ts';
import type { LlmCalls } from '../hosts/llm-calls.ts';
import { LlmQueries } from '../hosts/llm-queries.ts';
import { NotificationQueries } from '../hosts/notification-queries.ts';
import { KernelHost } from '../hosts/kernel-host.ts';
import { KernelQueries } from '../hosts/kernel-queries.ts';
import { PresetQueries } from '../hosts/preset-queries.ts';
import { ProcessQueries } from '../hosts/process-queries.ts';
import { UiQueries } from '../hosts/ui-queries.ts';
import type { ProviderCall, ProviderOutcome } from '../hosts/provider-invocations.ts';
import type { QueryPath } from '../hosts/query-path.ts';
import type { TrustService } from '../hosts/trust-service.ts';
import { WorkspaceQueries } from '../hosts/workspace-queries.ts';
import type { FaultPoints } from '../faults/fault-points.ts';
import type { InstallService } from '../install/install-service.ts';
import type { SnapshotStore } from '../install/snapshot-store.ts';
import { ModelRefresh } from '../llm/model-refresh.ts';
import type { DataMigrations } from '../migrations/data-migrations.ts';
import type { SavedPreferences } from '../preferences/user-preferences.ts';
import type { RegistryState } from '../registry/registry-state.ts';
import type { WorkspaceDirectory } from '../registry/workspace-directory.ts';
import type { PendingIndex } from '../scheduler/pending-index.ts';
import type { Scheduler } from '../scheduler/scheduler.ts';
import type { SchedulerTimers } from '../scheduler/timers.ts';
import type { SecretStore } from '../secrets/secret-store.ts';
import type { CommitPipeline } from '../storage/commit-pipeline.ts';
import type { Connection } from '../storage/driver.ts';
import type { PresetImportTokens } from '../presets/import-tokens.ts';
import type { UlidGenerator } from '../ulid.ts';
import { kernelCommandTable } from './kernel-command-table.ts';

export type KernelHostWiring = {
  connection: Connection;
  commits: KernelCommits;
  pipeline: CommitPipeline;
  scheduler: Scheduler;
  index: PendingIndex;
  registry: RegistryState;
  directory: WorkspaceDirectory;
  install: InstallService;
  snapshots: SnapshotStore;
  trust: TrustService;
  queries: QueryPath;
  secrets: SecretStore;
  versions: ExtensionVersions;
  migrations: DataMigrations;
  timers: SchedulerTimers;
  faults: FaultPoints;
  home: string;
  logger: KernelLogger;
  version: string;
  now: () => number;
  ids: UlidGenerator;
  presetTokens: PresetImportTokens;
  preferences: SavedPreferences;
  llm: LlmCalls;
  provide: (call: ProviderCall) => Promise<ProviderOutcome>;
  health: () => HealthResult;
  abortMessages: (messageIds: ReadonlySet<string>) => void;
  retireHosts: (extension: string) => void;
  killProcesses: (workspaceId: string) => Promise<void>;
  quarantine: (extension: string, reason: QuarantineReason) => Promise<void>;
  requestShutdown: () => void;
};

// The kernel host (ADR 0078) with the kernel's commands and queries (03 §3.8).
export function wireKernelHost(parts: KernelHostWiring): KernelHost {
  const { connection, registry } = parts;
  const current = () => registry.current();
  const presets = new PresetQueries({ connection, registry: current, tokens: parts.presetTokens });
  const llmQueries = new LlmQueries({ connection, registry, provide: parts.provide, now: parts.now });
  const refresh = new ModelRefresh({
    connection, registry, pipeline: parts.pipeline, commits: parts.commits, provide: parts.provide,
    logger: parts.logger, now: parts.now, ids: parts.ids,
  });
  refresh.start();
  return new KernelHost({
    connection, commits: parts.commits, scheduler: parts.scheduler, grants: registry, queries: parts.queries, abortMessages: parts.abortMessages,
    commands: kernelCommandTable({ ...parts, refresh }),
    requestShutdown: parts.requestShutdown,
    kernelQueries: new KernelQueries({
      connection, registry: current, health: parts.health, version: parts.version,
      extensions: new ExtensionQueries(connection, registry, registry), workspaces: new WorkspaceQueries(connection, registry, parts.secrets),
      inspection: new InspectionQueries({ connection, registry: current, grants: registry }), processes: new ProcessQueries(connection, registry), grants: registry,
      trust: parts.trust, presets, llm: llmQueries, preferences: parts.preferences,
      ui: new UiQueries({ connection, registry, preferences: parts.preferences }), notifications: new NotificationQueries(connection, parts.now),
    }),
  });
}
