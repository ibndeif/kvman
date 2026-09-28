import {
  messageRetryRequestSchema, notificationRequestSchema, notificationsMuteRequestSchema, notificationsReadAllRequestSchema,
} from '@kvman/protocol';
import type { RegistryState } from '../registry/registry-state.ts';
import type { GrantsSource } from '../router/grants.ts';
import type { Claim } from '../scheduler/dispatcher.ts';
import type { PendingIndex } from '../scheduler/pending-index.ts';
import type { Connection } from '../storage/driver.ts';
import type { KernelChange } from '../storage/kernel-changes.ts';
import { isAdministrator } from './administrators.ts';
import { parsed, refusal } from './command-payloads.ts';
import type { KernelCommits } from './kernel-commits.ts';
import { readWorkspace } from './workspace-rows.ts';

export type NotificationCommandsDeps = { connection: Connection; commits: KernelCommits; registry: RegistryState; grants: GrantsSource; index: PendingIndex };

// The tray commands (08 §8.11, ADR 0163) and kernel.message.retry (ADR 0164). Admission lets only a person send the
// tray commands (`access: 'user'`); retry is checked for an administrator here.
export class NotificationCommands {
  readonly #deps: NotificationCommandsDeps;

  constructor(deps: NotificationCommandsDeps) {
    this.#deps = deps;
  }

  async read(claim: Claim): Promise<void> {
    const request = parsed(notificationRequestSchema, claim.message);
    if (!request.ok) return this.#deps.commits.fail(claim, request.problem);
    await this.#change(claim, { kind: 'notification.read', id: request.value.id });
  }

  async dismiss(claim: Claim): Promise<void> {
    const request = parsed(notificationRequestSchema, claim.message);
    if (!request.ok) return this.#deps.commits.fail(claim, request.problem);
    await this.#change(claim, { kind: 'notification.dismiss', id: request.value.id });
  }

  async readAll(claim: Claim): Promise<void> {
    const request = parsed(notificationsReadAllRequestSchema, claim.message);
    if (!request.ok) return this.#deps.commits.fail(claim, request.problem);
    await this.#change(claim, { kind: 'notifications.read-all', workspaceId: request.value.workspaceId });
  }

  async mute(claim: Claim): Promise<void> {
    const { message } = claim;
    const request = parsed(notificationsMuteRequestSchema, message);
    if (!request.ok) return this.#deps.commits.fail(claim, request.problem);
    const { workspaceId, extension, muted } = request.value;
    if (readWorkspace(this.#deps.connection, workspaceId) === undefined) {
      return this.#deps.commits.fail(claim, refusal(message, 'WORKSPACE_INVALID', { detail: `no workspace ${workspaceId} exists` }));
    }
    if (this.#deps.registry.current().manifestOf(extension) === undefined) {
      return this.#deps.commits.fail(claim, refusal(message, 'NOT_FOUND', { detail: `no extension ${extension} is installed` }));
    }
    await this.#change(claim, { kind: 'notifications.mute', workspaceId, extension, muted });
  }

  // ADR 0164: the retried message is placed again for the scheduler once its row is pending without a backoff.
  async retry(claim: Claim): Promise<void> {
    const { message } = claim;
    if (!isAdministrator(this.#deps.grants, message)) {
      return this.#deps.commits.fail(claim, refusal(message, 'CAPABILITY_DENIED', { detail: 'only an administrator retries a message', hint: "request ext.requestCapability('kernel.admin')" }));
    }
    const request = parsed(messageRetryRequestSchema, message);
    if (!request.ok) return this.#deps.commits.fail(claim, request.problem);
    const { messageId } = request.value;
    if (!(await this.#change(claim, { kind: 'message.retry', messageId }))) return;
    this.#deps.index.remove(new Set([messageId]));
    this.#deps.index.placeStored(this.#deps.connection, [messageId]);
  }

  async #change(claim: Claim, change: KernelChange): Promise<boolean> {
    const { message } = claim;
    const unit = { origin: { kind: 'change', change, command: message, correlationId: message.correlationId } as const, writes: [], sends: [], publishes: [], replies: [] };
    return (await this.#deps.commits.commit(unit, claim)).committed;
  }
}
