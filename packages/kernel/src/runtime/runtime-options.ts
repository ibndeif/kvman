import type { FaultPoints } from '../faults/fault-points.ts';
import type { StartHostThread } from '../hosts/host-thread.ts';
import type { KernelLogger } from '../hosts/kernel-logger.ts';
import { hostPlatform, pnpmExecutable } from '../install/bundled-tools.ts';
import { InstallService } from '../install/install-service.ts';
import { installPaths } from '../install/install-paths.ts';
import { kernelSdkVersion } from '../install/kernel-packages.ts';
import { ForkedLoader } from '../install/loader-process.ts';
import type { CommandResolver } from '../processes/process-supervisor.ts';
import { kernelEventPayloads } from '../registry/kernel-types.ts';
import type { SchedulerTimers } from '../scheduler/timers.ts';
import type { SecretStore } from '../secrets/secret-store.ts';
import type { Connection } from '../storage/driver.ts';
import type { UlidGenerator } from '../ulid.ts';
import type { KernelIdentity } from './health.ts';

export type KernelRuntimeOptions = {
  databaseFile: string;
  connection: Connection;
  install: InstallSettings;
  // secrets.json, loaded at boot step 3 (ADR 0126).
  secrets: SecretStore;
  logger: KernelLogger;
  ids: UlidGenerator;
  now: () => number;
  timers: SchedulerTimers;
  poolSize: number;
  identity: KernelIdentity;
  // kernel.shutdown committed (ADR 0090): the daemon runs its shutdown.
  requestShutdown: () => void;
  startThread?: StartHostThread;
  // ADR 0165: the sandboxed hosts' starter for a snapshot folder; the testkit wraps the real one to inject crashes.
  startSandbox?: (snapshotFolder: string) => StartHostThread;
  // ADR 0166: the testkit's fake processes.
  commands?: CommandResolver;
  // ADR 0131: the read pool's threads, 2 unless given.
  readPoolSize?: number;
  // ADR 0100: the fault points of a test run; inert unless given.
  faults?: FaultPoints;
};

// Where extensions are installed from and to (06 §6.2, §6.9): the home folder, the builtin tarballs, the npm
// registry of KVMAN_NPM_REGISTRY, and the environment whose path and proxies pnpm and git use.
export type InstallSettings = { home: string; builtin: string; registry: string; environment: NodeJS.ProcessEnv };

export function installService(options: KernelRuntimeOptions): InstallService {
  const { install, timers, now, identity } = options;
  return new InstallService({
    paths: installPaths(install.home, install.builtin), pnpm: () => pnpmExecutable(hostPlatform()), registry: install.registry, kvmanVersion: identity.version,
    environment: install.environment, timers, loader: new ForkedLoader(timers), sdkVersion: kernelSdkVersion(), kernelEvents: kernelEventPayloads(), now,
  });
}

