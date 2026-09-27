import type { QuarantineReason } from '@kvman/protocol';
import type { FaultPoints } from '../faults/fault-points.ts';
import { EnableCommands } from '../hosts/enable-commands.ts';
import { ExtensionCommands } from '../hosts/extension-commands.ts';
import { CatalogCommands } from '../hosts/catalog-commands.ts';
import type { KernelCommits } from '../hosts/kernel-commits.ts';
import type { ExtensionVersions } from '../hosts/extension-versions.ts';
import type { KernelCommand } from '../hosts/kernel-host.ts';
import type { KernelLogger } from '../hosts/kernel-logger.ts';
import { PresetApply } from '../hosts/preset-apply.ts';
import { PreviewWorkspaces } from '../hosts/preview-workspaces.ts';
import { PresetUpdate } from '../hosts/preset-update.ts';
import { SerialChanges } from '../hosts/serial-changes.ts';
import { SettingCommands } from '../hosts/setting-commands.ts';
import type { TrustService } from '../hosts/trust-service.ts';
import { VersionCommands } from '../hosts/version-commands.ts';
import { WorkspaceCommands } from '../hosts/workspace-commands.ts';
import { WorkspaceForgetting } from '../hosts/workspace-forgetting.ts';
import type { InstallService } from '../install/install-service.ts';
import type { SnapshotStore } from '../install/snapshot-store.ts';
import type { DataMigrations } from '../migrations/data-migrations.ts';
import type { PresetImportTokens } from '../presets/import-tokens.ts';
import { StagedApplies } from '../presets/staged-applies.ts';
import type { RegistryState } from '../registry/registry-state.ts';
import type { WorkspaceDirectory } from '../registry/workspace-directory.ts';
import type { Scheduler } from '../scheduler/scheduler.ts';
import type { SchedulerTimers } from '../scheduler/timers.ts';
import type { CommitPipeline } from '../storage/commit-pipeline.ts';
import type { Connection } from '../storage/driver.ts';

export type KernelCommandDeps = {
  connection: Connection;
  commits: KernelCommits;
  pipeline: CommitPipeline;
  scheduler: Scheduler;
  registry: RegistryState;
  directory: WorkspaceDirectory;
  install: InstallService;
  snapshots: SnapshotStore;
  trust: TrustService;
  versions: ExtensionVersions;
  migrations: DataMigrations;
  timers: SchedulerTimers;
  faults: FaultPoints;
  home: string;
  logger: KernelLogger;
  presetTokens: PresetImportTokens;
  now: () => number;
  abortMessages: (messageIds: ReadonlySet<string>) => void;
  killProcesses: (workspaceId: string) => Promise<void>;
  quarantine: (extension: string, reason: QuarantineReason) => Promise<void>;
};

// The kernel commands that change extensions and their versions, workspaces, presets, trust, config, and secrets
// (03 §3.8), by type.
export function kernelCommandTable(deps: KernelCommandDeps): Map<string, KernelCommand> {
  const { connection, commits, scheduler, registry, abortMessages } = deps;
  const serial = new SerialChanges();
  const extensions = new ExtensionCommands({ connection, commits, scheduler, grants: registry, registry, install: deps.install, serial, abortMessages });
  const enabling = new EnableCommands({ connection, commits, scheduler, registry, snapshots: deps.snapshots, migrations: deps.migrations, serial, quarantine: deps.quarantine });
  const versions = new VersionCommands({ connection, commits, scheduler, registry, grants: registry, versions: deps.versions, serial });
  const workspaces = new WorkspaceCommands({ connection, commits, registry, home: deps.home });
  const forgetting = new WorkspaceForgetting({
    connection, pipeline: deps.pipeline, commits, scheduler, registry, directory: deps.directory, serial, timers: deps.timers, faults: deps.faults, abortMessages,
    killProcesses: deps.killProcesses, home: deps.home, logger: deps.logger,
  });
  const previews = new PreviewWorkspaces({ connection, commits, registry, serial, home: deps.home });
  const settings = new SettingCommands({ connection, commits, registry });
  const catalog = new CatalogCommands({ connection, commits, serial, tokens: deps.presetTokens, grants: registry, registry: () => registry.current() });
  const stagedApplies = new StagedApplies({ install: deps.install, now: deps.now });
  const presetApply = new PresetApply({
    connection, commits, install: deps.install, staged: stagedApplies, registry, serial, versions: deps.versions,
    faults: deps.faults, scheduler, snapshots: deps.snapshots, migrations: deps.migrations,
  });
  const presetUpdate = new PresetUpdate({
    connection, commits, scheduler, registry, snapshots: deps.snapshots, migrations: deps.migrations, serial,
    quarantine: deps.quarantine,
  });
  return new Map<string, KernelCommand>([
    ['kernel.extension.stage', (claim, signal) => extensions.stage(claim, signal)],
    ['kernel.extension.install', (claim) => extensions.install(claim)],
    ['kernel.extension.uninstall', (claim) => extensions.uninstall(claim)],
    ['kernel.extension.enable', (claim) => enabling.enable(claim)],
    ['kernel.extension.disable', (claim) => enabling.disable(claim)],
    ['kernel.extension.reload', (claim) => versions.reload(claim)],
    ['kernel.extension.rollback', (claim) => versions.rollback(claim)],
    ['kernel.extension.unquarantine', (claim) => versions.unquarantine(claim)],
    ['kernel.workspace.open', (claim) => workspaces.open(claim)],
    ['kernel.workspace.rename', (claim) => workspaces.rename(claim)],
    ['kernel.workspace.forget', (claim, signal) => forgetting.forget(claim, signal)],
    ['kernel.workspace.preview.create', (claim) => previews.create(claim)],
    ['kernel.trust.grant', (claim) => deps.trust.grant(claim)],
    ['kernel.trust.revoke', (claim) => deps.trust.revoke(claim)],
    ['kernel.config.set', (claim) => settings.setConfig(claim)],
    ['kernel.secret.set', (claim) => settings.setSecret(claim)],
    ['kernel.secret.clear', (claim) => settings.clearSecret(claim)],
    ['kernel.preset.import', (claim) => catalog.import(claim)],
    ['kernel.preset.apply.stage', (claim, signal) => presetApply.stage(claim, signal)],
    ['kernel.preset.apply', (claim) => presetApply.apply(claim)],
    ['kernel.preset.update', (claim) => presetUpdate.update(claim)],
    ['kernel.preset.save', (claim) => catalog.save(claim)],
    ['kernel.preset.delete', (claim) => catalog.delete(claim)],
  ]);
}
