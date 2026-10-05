import type { Store, Transaction } from '@kvman/sdk';
import { artifactDocSchema, backgroundDocSchema, messageDocSchema, processDocSchema, questionDocSchema, queuedDocSchema, sessionDocSchema, turnDocSchema } from '../schemas/records.ts';
import { signInDocSchema } from '../mcp/sign-in-record.ts';
import { connectorDocSchema, handlerDocSchema, handlerJobDocSchema, sectionDocSchema } from '../schemas/registry.ts';

// kvcoder's collections (plan 08 §8.4 "Where entries live"): sessions and their records, and workspace sections, in
// the workspace store; connectors, session handlers, handler-job ids, global sections, background processes, and started MCP sign-ins in the global store.

/** The collections through the store's Promise calls. */
export function records(store: Store) {
  return {
    sessions: store.collection('sessions', sessionDocSchema),
    messages: store.collection('messages', messageDocSchema),
    queued: store.collection('queued', queuedDocSchema),
    turns: store.collection('turns', turnDocSchema),
    questions: store.collection('questions', questionDocSchema),
    artifacts: store.collection('artifacts', artifactDocSchema),
    background: store.collection('background', backgroundDocSchema),
    sections: store.collection('sections', sectionDocSchema),
    globalSections: store.global.collection('sections', sectionDocSchema),
    processes: store.global.collection('processes', processDocSchema),
    connectors: store.global.collection('connectors', connectorDocSchema),
    handlers: store.global.collection('handlers', handlerDocSchema),
    handlerJobs: store.global.collection('handler-jobs', handlerJobDocSchema),
    signIns: store.global.collection('mcp-sign-ins', signInDocSchema),
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
    artifacts: tx.collection('artifacts', artifactDocSchema),
    background: tx.collection('background', backgroundDocSchema),
    sections: tx.collection('sections', sectionDocSchema),
    globalSections: tx.global.collection('sections', sectionDocSchema),
    processes: tx.global.collection('processes', processDocSchema),
    connectors: tx.global.collection('connectors', connectorDocSchema),
    handlers: tx.global.collection('handlers', handlerDocSchema),
    handlerJobs: tx.global.collection('handler-jobs', handlerJobDocSchema),
    signIns: tx.global.collection('mcp-sign-ins', signInDocSchema),
  };
}

export type TxRecords = ReturnType<typeof txRecords>;
