import { extensionReloadRequestSchema, extensionRollbackRequestSchema, extensionUnquarantineRequestSchema, type Message, type Problem } from '@kvman/protocol';
import type { GrantsSource } from '../router/grants.ts';
import type { RegistryState } from '../registry/registry-state.ts';
import type { Claim } from '../scheduler/dispatcher.ts';
import type { Scheduler } from '../scheduler/scheduler.ts';
import type { CommitUnit } from '../storage/commit-unit.ts';
import type { Connection } from '../storage/driver.ts';
import { isAdministrator } from './administrators.ts';
import { parsed, refusal } from './command-payloads.ts';
import type { ExtensionVersions, ReloadRequest } from './extension-versions.ts';
import type { KernelCommits } from './kernel-commits.ts';
import type { SerialChanges } from './serial-changes.ts';

export type VersionCommandsDeps = {
  connection: Connection;
  commits: KernelCommits;
  scheduler: Scheduler;
  registry: RegistryState;
  grants: GrantsSource;
  versions: ExtensionVersions;
  serial: SerialChanges;
};

// kernel.extension.reload, rollback, and unquarantine (03 §3.8, 06 §6.6–§6.7, 03 §3.6), one at a time with the other
// registry changes (ADR 0123).
export class VersionCommands {
  readonly #deps: VersionCommandsDeps;

  constructor(deps: VersionCommandsDeps) {
    this.#deps = deps;
  }

  reload(claim: Claim): Promise<void> {
    return this.#deps.serial.run(async () => {
      const request = parsed(extensionReloadRequestSchema, claim.message);
      if (!request.ok) return this.#deps.commits.fail(claim, request.problem);
      const denied = request.value.grants === undefined ? this.#adminRefusal(claim.message) : this.#grantRefusal(claim.message);
      if (denied !== undefined) return this.#deps.commits.fail(claim, denied);
      return this.#run(claim, request.value);
    });
  }

  rollback(claim: Claim): Promise<void> {
    return this.#deps.serial.run(async () => {
      const request = parsed(extensionRollbackRequestSchema, claim.message);
      if (!request.ok) return this.#deps.commits.fail(claim, request.problem);
      const denied = this.#adminRefusal(claim.message);
      if (denied !== undefined) return this.#deps.commits.fail(claim, denied);
      return this.#run(claim, request.value);
    });
  }

  // 03 §3.6: only a HOST_FAILURES quarantine is lifted this way; the code or data behind the others is still unusable.
  unquarantine(claim: Claim): Promise<void> {
    return this.#deps.serial.run(async () => {
      const { message } = claim;
      const request = parsed(extensionUnquarantineRequestSchema, message);
      if (!request.ok) return this.#deps.commits.fail(claim, request.problem);
      const { name } = request.value;
      const row = this.#deps.connection.prepare('SELECT status, quarantine_reason FROM extensions WHERE name = ? AND active_digest IS NOT NULL').get(name);
      if (row === undefined) return this.#deps.commits.fail(claim, refusal(message, 'NOT_FOUND', { detail: `no extension ${name} is installed` }));
      if (row['status'] !== 'quarantined') {
        await this.#deps.commits.reply(claim, {});
        return undefined;
      }
      const reason = String(row['quarantine_reason']);
      if (reason !== 'HOST_FAILURES') {
        const hint = reason === 'MIGRATION_FAILED' ? 'retry the upgrade, or disable it' : 'roll back to another version, or disable it';
        return this.#deps.commits.fail(claim, refusal(message, 'EXT_QUARANTINED', { detail: `${name} is quarantined for ${reason}, which re-enabling does not fix`, hint, params: { reason } }));
      }
      const unit: CommitUnit = { origin: { kind: 'change', change: { kind: 'extension.unquarantine', name }, command: message, correlationId: message.correlationId }, writes: [], sends: [], publishes: [], replies: [] };
      const result = await this.#deps.commits.commit(unit, claim);
      if (!result.committed) return undefined;
      this.#deps.registry.refresh();
      this.#deps.scheduler.pump();
      return undefined;
    });
  }

  // A reload the kernel's shutdown interrupted stays running and is redelivered at the next start (ADR 0091).
  async #run(claim: Claim, request: ReloadRequest): Promise<void> {
    const outcome = await this.#deps.versions.reload(request, { correlationId: claim.message.correlationId, claim });
    if (!outcome.ok && !outcome.settled && outcome.problem.code !== 'KERNEL_STOPPING') await this.#deps.commits.fail(claim, outcome.problem);
  }

  #adminRefusal(message: Message): Problem | undefined {
    if (isAdministrator(this.#deps.grants, message)) return undefined;
    return refusal(message, 'CAPABILITY_DENIED', { detail: `${message.source} may not send ${message.type}`, hint: 'request kernel.admin' });
  }

  // 03 §3.8: a reload with grants is a grant command, confirmed only in the shell's grant dialog by a person.
  #grantRefusal(message: Message): Problem | undefined {
    if (message.source.startsWith('user:')) return undefined;
    return refusal(message, 'CALLER_NOT_ALLOWED', { detail: `${message.type} with grants is confirmed by a person in the grant dialog`, hint: 'open the grant dialog with openGrantDialog' });
  }
}
