import type { Store, Transaction } from '@kvman/sdk';
import { answerReceiptDocSchema, artifactDocSchema, backgroundDocSchema, fileBackupDocSchema, fileChangeDocSchema, filePartDocSchema, fileViewDocSchema, messageDocSchema, processDocSchema, questionDocSchema, queuedDocSchema, runDocSchema, sendReceiptDocSchema, sessionDocSchema, stepIntentDocSchema, turnDocSchema } from '../schemas/records.ts';
import { mapDocSchema } from '../maps/map-schema.ts';
import { signInDocSchema } from '../mcp/sign-in-record.ts';
import { readEndingDocSchema } from '../schemas/read-ending.ts';
import { mcpSessionDocSchema } from '../schemas/mcp-session.ts';
import { connectorDocSchema, handlerDocSchema, handlerJobDocSchema, sectionDocSchema, slashDocSchema } from '../schemas/registry.ts';

// kvcoder's collections (plan 08 §8.4 "Where entries live"): sessions and their records, and workspace sections, in
// the workspace store; connectors, slash commands, session handlers, handler-job ids, global sections, background
// processes, and started MCP sign-ins in the global store.

/** The collections through the store's Promise calls. */
export function records(store: Store) {
  return {
    sessions: store.collection('sessions', sessionDocSchema),
    stepIntents: store.collection('step-intents', stepIntentDocSchema),
    messages: store.collection('messages', messageDocSchema),
    queued: store.collection('queued', queuedDocSchema),
    turns: store.collection('turns', turnDocSchema),
    questions: store.collection('questions', questionDocSchema),
    answerReceipts: store.collection('answer-receipts', answerReceiptDocSchema),
    sendReceipts: store.collection('send-receipts', sendReceiptDocSchema),
    fileViews: store.collection('file-views', fileViewDocSchema),
    fileBackups: store.collection('file-backups', fileBackupDocSchema),
    fileChanges: store.collection('file-changes', fileChangeDocSchema),
    fileParts: store.collection('file-parts', filePartDocSchema),
    artifacts: store.collection('artifacts', artifactDocSchema),
    maps: store.collection('maps', mapDocSchema),
    background: store.collection('background', backgroundDocSchema),
    readEndings: store.collection('read-endings', readEndingDocSchema),
    mcpSessions: store.collection('mcp-sessions', mcpSessionDocSchema),
    runs: store.collection('runs', runDocSchema),
    sections: store.collection('sections', sectionDocSchema),
    globalSections: store.global.collection('sections', sectionDocSchema),
    processes: store.global.collection('processes', processDocSchema),
    connectors: store.global.collection('connectors', connectorDocSchema),
    slashCommands: store.global.collection('slash-commands', slashDocSchema),
    handlers: store.global.collection('handlers', handlerDocSchema),
    handlerJobs: store.global.collection('handler-jobs', handlerJobDocSchema),
    signIns: store.global.collection('mcp-sign-ins', signInDocSchema),
  };
}

/** The same collections inside a transaction. */
export function txRecords(tx: Transaction) {
  return {
    sessions: tx.collection('sessions', sessionDocSchema),
    stepIntents: tx.collection('step-intents', stepIntentDocSchema),
    messages: tx.collection('messages', messageDocSchema),
    queued: tx.collection('queued', queuedDocSchema),
    turns: tx.collection('turns', turnDocSchema),
    questions: tx.collection('questions', questionDocSchema),
    answerReceipts: tx.collection('answer-receipts', answerReceiptDocSchema),
    sendReceipts: tx.collection('send-receipts', sendReceiptDocSchema),
    fileViews: tx.collection('file-views', fileViewDocSchema),
    fileBackups: tx.collection('file-backups', fileBackupDocSchema),
    fileChanges: tx.collection('file-changes', fileChangeDocSchema),
    fileParts: tx.collection('file-parts', filePartDocSchema),
    artifacts: tx.collection('artifacts', artifactDocSchema),
    maps: tx.collection('maps', mapDocSchema),
    background: tx.collection('background', backgroundDocSchema),
    readEndings: tx.collection('read-endings', readEndingDocSchema),
    mcpSessions: tx.collection('mcp-sessions', mcpSessionDocSchema),
    runs: tx.collection('runs', runDocSchema),
    sections: tx.collection('sections', sectionDocSchema),
    globalSections: tx.global.collection('sections', sectionDocSchema),
    processes: tx.global.collection('processes', processDocSchema),
    connectors: tx.global.collection('connectors', connectorDocSchema),
    slashCommands: tx.global.collection('slash-commands', slashDocSchema),
    handlers: tx.global.collection('handlers', handlerDocSchema),
    handlerJobs: tx.global.collection('handler-jobs', handlerJobDocSchema),
    signIns: tx.global.collection('mcp-sign-ins', signInDocSchema),
  };
}

export type TxRecords = ReturnType<typeof txRecords>;
