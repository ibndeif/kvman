import type { Store, Transaction } from '@kvman/sdk';
import { backgroundDocSchema, messageDocSchema, questionDocSchema, queuedDocSchema, sessionDocSchema, turnDocSchema } from '../schemas/records.ts';
import { connectorDocSchema, handlerDocSchema, handlerJobDocSchema, sectionDocSchema } from '../schemas/registry.ts';

// kvcoder's collections (plan 08 §8.4 "Where entries live"): sessions and their records, and workspace sections, in
// the workspace store; connectors, session handlers, handler-job ids, and global sections in the global store.

/** The collections through the store's Promise calls. */
export function records(store: Store) {
  return {
    sessions: store.collection('sessions', sessionDocSchema),
    messages: store.collection('messages', messageDocSchema),
    queued: store.collection('queued', queuedDocSchema),
    turns: store.collection('turns', turnDocSchema),
    questions: store.collection('questions', questionDocSchema),
    background: store.collection('background', backgroundDocSchema),
    sections: store.collection('sections', sectionDocSchema),
    globalSections: store.global.collection('sections', sectionDocSchema),
    connectors: store.global.collection('connectors', connectorDocSchema),
    handlers: store.global.collection('handlers', handlerDocSchema),
    handlerJobs: store.global.collection('handler-jobs', handlerJobDocSchema),
  };
}

/** The same collections inside a transaction. */
export function txRecords(tx: Transaction) {
  return {
    sessions: tx.collection('sessions', sessionDocSchema),
    messages: tx.collection('messages', messageDocSchema),
    queued: tx.collection('queued', queuedDocSchema),
    turns: tx.collection('turns', turnDocSchema),
    questions: tx.collection('questions', questionDocSchema),
    background: tx.collection('background', backgroundDocSchema),
    sections: tx.collection('sections', sectionDocSchema),
    globalSections: tx.global.collection('sections', sectionDocSchema),
    connectors: tx.global.collection('connectors', connectorDocSchema),
    handlers: tx.global.collection('handlers', handlerDocSchema),
    handlerJobs: tx.global.collection('handler-jobs', handlerJobDocSchema),
  };
}

export type TxRecords = ReturnType<typeof txRecords>;
