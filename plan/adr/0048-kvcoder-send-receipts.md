# ADR 0048 — kvcoder message drafts and send receipts

Status: accepted by the product owner by choice on 2026-10-12, before source. This records the KVC-19 contracts.

## Decisions

1. `kvcoder.message.send` takes an optional `sendId`: a string of 1 to 100 characters that the page makes for one send. Its output stays `{}`. Without `sendId` the command behaves as before. `kvcoder.message.inject` is unchanged.
2. Add the workspace collection `send-receipts`, `sendReceipts` in records/txRecords. IDs are the kernel's. Every field is required, with no defaults: string `sendId` and `sessionId`; `messageFingerprint`, the 64-character hexadecimal SHA-256 digest of the message's text and file ids in order; ISO `createdAt`. No raw text and no file names. No new table, raw SQL, or index.
3. The receipt is inserted in the same store transaction that accepts the message (appended or queued), so a receipt proves the message was accepted and nothing else. That transaction reads the receipt again, so two sends with one `sendId` at once accept one message.
4. A send whose `sendId` has a receipt for the same session and the same fingerprint is acknowledged with `{}` and does nothing: no message, no turn, no recovery, no file work. It is checked before the message's files are read, because an accepted send has already moved its uploads into the workspace. A send whose `sendId` has a receipt for another session or another fingerprint fails `VALIDATION_FAILED`, without either text. No new error code.
5. A session's send receipts are deleted with the session.
6. The send box keeps its text and attachments in the page's memory, by workspace and chat (the new chat has its own), until the send is confirmed. They survive moving between pages and a rebuilt component, not a page reload. While a send is on its way the box is disabled, so one draft sends once. A failed send keeps the text and attachments and shows one line above the box: what failed, and that sending again retries. A retry of the same text and files reuses its `sendId`; changed text or files make a new one.
7. On the new-chat page the draft remembers the chat it created. A retry sends into that chat instead of creating another. Nothing is deleted automatically: a chat the person abandons stays in the list, empty. If that chat no longer exists, the next retry creates a new one.

## Verification

Scenarios M2.4-E136 to E141, written before source. Native isolated stores for the receipt, the acknowledgment, the conflict, the concurrent pair, and deletion; mounted components for the draft; one real Chromium run for a failed send, moving away and back, and the retry.
