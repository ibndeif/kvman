import type { Message, Notification, OutboundSend, Problem, QuarantineReason } from '@kvman/protocol';
import type { SecretChange } from '../secrets/secret-store.ts';

// ADR 0164: the kernel's own notifications, sent as ui.notify in the unit that records what happened. Their text is
// `kvman:` catalog keys, which the shell ships; they are never rate limited or muted.
function notify(notification: Notification): OutboundSend {
  return { type: 'ui.notify', payload: notification };
}

export function quarantineNotice(extension: string, reason: QuarantineReason): OutboundSend {
  return notify({
    key: `quarantine:${extension}`, level: 'error', global: true, title: { $t: 'notifications.quarantined', extension, reason },
    actions: [{ label: '$t.notifications.actions.recovery', navigate: '/_kvman' }],
  });
}

// A migration that failed while the old version stays active (04 §4.8); a part-way failure quarantines instead.
export function migrationNotice(extension: string, problem: Problem): OutboundSend {
  return notify({ key: `migration:${extension}`, level: 'error', global: true, title: { $t: 'notifications.migrationFailed', extension }, problem });
}

// A dead message of a person's correlation, in its workspace (global without one), with a Retry.
export function deadLetterNotice(message: Message, problem: Problem): OutboundSend {
  return notify({
    key: `dead:${message.id}`, level: 'error', ...(message.workspaceId === undefined ? { global: true } : {}),
    title: { $t: 'notifications.messageDead', type: message.type }, problem,
    actions: [{ label: '$t.notifications.actions.retry', command: 'kernel.message.retry', payload: { messageId: message.id } }],
  });
}

// A secrets-file write that failed after its commit (04 §4.7): one per changed secret, never its value.
export function secretsNotice(change: SecretChange): OutboundSend {
  if (change.kind === 'clear-extension') {
    return notify({ key: `secrets:${change.extension}`, level: 'error', global: true, title: { $t: 'notifications.secretsWriteFailed', extension: change.extension } });
  }
  const title = { $t: 'notifications.secretsWriteFailed', extension: change.extension, secret: change.name };
  return notify({ key: `secrets:${change.extension}:${change.name}`, level: 'error', global: true, title });
}
