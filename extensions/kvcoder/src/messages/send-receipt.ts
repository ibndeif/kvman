import { createHash } from 'node:crypto';
import { invalid } from '../problems.ts';
import type { SendReceiptDoc } from '../schemas/records.ts';

// A send's receipt (ADR 0048): the page names a send with `sendId`, and a repeat of it is acknowledged, never applied
// twice. The fingerprint tells a repeat from another message under the same id.

export type Sent = { sendId: string; sessionId: string; messageFingerprint: string };

export function sentBy(sendId: string, sessionId: string, text: string, fileIds: readonly string[]): Sent {
  return { sendId, sessionId, messageFingerprint: createHash('sha256').update(JSON.stringify([text, fileIds])).digest('hex') };
}

/** Whether the receipt already accepted this send; another message or session under its id is a conflict. */
export function acknowledged(receipt: SendReceiptDoc | undefined, sent: Sent): boolean {
  if (receipt === undefined) return false;
  if (receipt.sessionId !== sent.sessionId || receipt.messageFingerprint !== sent.messageFingerprint) throw invalid('This sendId was already used for another message.', {});
  return true;
}
