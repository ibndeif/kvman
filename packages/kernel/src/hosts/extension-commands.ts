import { installRequestSchema, stageRequestSchema, uninstallRequestSchema, type Message, type Problem, type StageResult } from '@kvman/protocol';
import { InstallFailure } from '../install/install-failure.ts';
import type { InstallService } from '../install/install-service.ts';
import { kernelProblem, ProblemError } from '../problems.ts';
import type { RegistryState } from '../registry/registry-state.ts';
import type { GrantsSource } from '../router/grants.ts';
import type { Claim } from '../scheduler/dispatcher.ts';
import type { Scheduler } from '../scheduler/scheduler.ts';
import type { Connection } from '../storage/driver.ts';
import type { ExtensionVersion } from '../storage/extension-changes.ts';
import { isAdministrator } from './administrators.ts';
import { parsed } from './command-payloads.ts';
import type { KernelCommits } from './kernel-commits.ts';
import type { SerialChanges } from './serial-changes.ts';

export type ExtensionCommandsDeps = {
  connection: Connection;
  commits: KernelCommits;
  scheduler: Scheduler;
  grants: GrantsSource;
  registry: RegistryState;
  install: InstallService;
  serial: SerialChanges;
  abortMessages: (messageIds: ReadonlySet<string>) => void;
  // The hosts that loaded the extension leave, so no later version of it runs the old code (06 §6.6 step 5).
  retireHosts: (extension: string) => void;
};

// A kernel command stopped by the kernel's shutdown runs again at the next start (ADR 0091).
export class KernelStopping extends Error {
  constructor() {
    super('the kernel is stopping');
    this.name = 'KernelStopping';
  }
}

function problemOf(error: unknown, message: Message): Problem {
  if (error instanceof InstallFailure) return error.problem(message.correlationId, message.id);
  if (error instanceof ProblemError) return { ...error.problem, correlationId: message.correlationId, messageId: message.id };
  throw error;
}

// kernel.extension.stage, install, and uninstall (03 §3.8, 06 §6.2, §6.8, ADRs 0118, 0120), run by the kernel host.
export class ExtensionCommands {
  readonly #deps: ExtensionCommandsDeps;

  constructor(deps: ExtensionCommandsDeps) {
    this.#deps = deps;
  }

  async stage(claim: Claim, signal: AbortSignal): Promise<void> {
    const { message } = claim;
    const refused = this.#refusal(message);
    if (refused !== undefined) return this.#deps.commits.fail(claim, refused);
    const request = parsed(stageRequestSchema, message);
    if (!request.ok) return this.#deps.commits.fail(claim, request.problem);
    const { source } = request.value;
    let result: StageResult;
    try {
      result = await this.#deps.install.stage(source, message.correlationId, signal);
    } catch (error) {
      if (error instanceof KernelStopping) throw error;
      return this.#deps.commits.fail(claim, problemOf(error, message));
    }
    const committed = await this.#deps.commits.reply(claim, result);
    if (!committed.committed) await this.#deps.install.discard(result.confirmationToken);
  }

  async install(claim: Claim): Promise<void> {
    const { message } = claim;
    const refused = this.#refusal(message);
    if (refused !== undefined) return this.#deps.commits.fail(claim, refused);
    const request = parsed(installRequestSchema, message);
    if (!request.ok) return this.#deps.commits.fail(claim, request.problem);
    const { confirmationToken } = request.value;
    let version: ExtensionVersion;
    try {
      version = await this.#deps.install.confirm(confirmationToken);
    } catch (error) {
      return this.#deps.commits.fail(claim, problemOf(error, message));
    }
    const change = { kind: 'install', version } as const;
    await this.#deps.serial.run(async () => {
      const result = await this.#deps.commits.commit({ origin: { kind: 'change', change, command: message, correlationId: message.correlationId }, writes: [], sends: [], publishes: [], replies: [] }, claim);
      if (result.committed) this.#deps.registry.refresh();
    });
  }

  uninstall(claim: Claim): Promise<void> {
    return this.#deps.serial.run(() => this.#uninstall(claim));
  }

  async #uninstall(claim: Claim): Promise<void> {
    const { message } = claim;
    const request = parsed(uninstallRequestSchema, message);
    if (!request.ok) return this.#deps.commits.fail(claim, request.problem);
    const { name, deleteData, keepSnapshots } = request.value;
    const digests = this.#deps.connection.prepare('SELECT digest FROM extension_versions WHERE name = ?').all(name).map((row) => String(row['digest']));
    if (digests.length === 0) return this.#deps.commits.fail(claim, kernelProblem('NOT_FOUND', { correlationId: message.correlationId, messageId: message.id, detail: `no extension ${name} is installed` }));
    const workspaces = [...this.#deps.registry.enabled()].filter(([, names]) => names.includes(name)).map(([workspaceId]) => workspaceId).sort();
    if (workspaces.length > 0) {
      const problem = kernelProblem('EXT_IN_USE', { correlationId: message.correlationId, messageId: message.id, detail: `${name} is enabled in ${workspaces.join(', ')}`, hint: 'disable it in every workspace first', params: { workspaces } });
      return this.#deps.commits.fail(claim, problem);
    }
    const change = { kind: 'uninstall', name, deleteData: deleteData === true } as const;
    const result = await this.#deps.commits.commit({ origin: { kind: 'change', change, command: message, correlationId: message.correlationId }, writes: [], sends: [], publishes: [], replies: [] }, claim);
    if (!result.committed) return;
    this.#deps.registry.refresh();
    const ended = new Set(result.ended.map((entry) => entry.messageId));
    this.#deps.abortMessages(ended);
    this.#deps.scheduler.forget(ended);
    this.#deps.retireHosts(name);
    if (keepSnapshots !== true) await this.#deps.install.removeSnapshots(digests);
  }

  #refusal(message: Message): Problem | undefined {
    if (isAdministrator(this.#deps.grants, message)) return undefined;
    return kernelProblem('CAPABILITY_DENIED', { correlationId: message.correlationId, messageId: message.id, detail: `${message.source} may not send ${message.type}`, hint: 'request kernel.admin' });
  }
}
