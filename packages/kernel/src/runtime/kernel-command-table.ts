import type { QuarantineReason } from '@kvman/protocol';
import { ConfigChecker } from '../config/config-values.ts';
import type { FaultPoints } from '../faults/fault-points.ts';
import { EnableCommands } from '../hosts/enable-commands.ts';
import { ExtensionCommands } from '../hosts/extension-commands.ts';
import type { KernelCommits } from '../hosts/kernel-commits.ts';
import type { KernelCommand } from '../hosts/kernel-host.ts';
import { SerialChanges } from '../hosts/serial-changes.ts';
import { SettingCommands } from '../hosts/setting-commands.ts';
import type { TrustService } from '../hosts/trust-service.ts';
import { WorkspaceCommands } from '../hosts/workspace-commands.ts';
import { WorkspaceForgetting } from '../hosts/workspace-forgetting.ts';
import type { InstallService } from '../install/install-service.ts';
import type { SnapshotStore } from '../install/snapshot-store.ts';
import type { RegistryState } from '../registry/registry-state.ts';
import type { WorkspaceDirectory } from '../registry/workspace-directory.ts';
import { PayloadValidators } from '../router/payload-validators.ts';
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
  timers: SchedulerTimers;
  faults: FaultPoints;
  home: string;
  abortMessages: (messageIds: ReadonlySet<string>) => void;
  killProcesses: (workspaceId: string) => Promise<void>;
  quarantine: (extension: string, reason: QuarantineReason) => Promise<void>;
};

// The kernel commands that change extensions, workspaces, presets, trust, config, and secrets (03 §3.8), by type.
export function kernelCommandTable(deps: KernelCommandDeps): Map<string, KernelCommand> {
  const { connection, commits, scheduler, registry, abortMessages } = deps;
  const serial = new SerialChanges();
  const extensions = new ExtensionCommands({ connection, commits, scheduler, grants: registry, registry, install: deps.install, serial, abortMessages });
  const enabling = new EnableCommands({
    connection, commits, scheduler, registry, snapshots: deps.snapshots, config: new ConfigChecker(new PayloadValidators()), serial, quarantine: deps.quarantine,
  });
  const workspaces = new WorkspaceCommands({ connection, commits, registry, home: deps.home });
  const forgetting = new WorkspaceForgetting({
    connection, pipeline: deps.pipeline, commits, scheduler, registry, directory: deps.directory, serial, timers: deps.timers, faults: deps.faults, abortMessages,
    killProcesses: deps.killProcesses,
  });
  const settings = new SettingCommands({ connection, commits, registry });
  return new Map<string, KernelCommand>([
    ['kernel.extension.stage', (claim, signal) => extensions.stage(claim, signal)],
    ['kernel.extension.install', (claim) => extensions.install(claim)],
    ['kernel.extension.uninstall', (claim) => extensions.uninstall(claim)],
    ['kernel.extension.enable', (claim) => enabling.enable(claim)],
    ['kernel.extension.disable', (claim) => enabling.disable(claim)],
    ['kernel.workspace.open', (claim) => workspaces.open(claim)],
    ['kernel.workspace.rename', (claim) => workspaces.rename(claim)],
    ['kernel.workspace.forget', (claim, signal) => forgetting.forget(claim, signal)],
    ['kernel.trust.grant', (claim) => deps.trust.grant(claim)],
    ['kernel.trust.revoke', (claim) => deps.trust.revoke(claim)],
    ['kernel.config.set', (claim) => settings.setConfig(claim)],
    ['kernel.secret.set', (claim) => settings.setSecret(claim)],
    ['kernel.secret.clear', (claim) => settings.clearSecret(claim)],
  ]);
}
