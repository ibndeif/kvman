import { defineExtension, z } from '@kvman/sdk';
import { registerAdapters } from './notes-adapters.ts';
import { registerBasics } from './notes-basics.ts';
import { registerCalls } from './notes-calls.ts';
import { registerDeferred } from './notes-deferred.ts';
import { registerLive } from './notes-live.ts';
import { registerQueries } from './notes-queries.ts';
import { registerSupervision } from './notes-supervision.ts';
import { workerState } from './notes-state.ts';

// The main fixture of the host conformance suite: every kind, the three request/reply patterns, and ctx misuse.
export default defineExtension({ name: '@acme/notes', namespace: 'notes', title: 'Notes', description: 'Notes for the host tests.' }, (ext) => {
  workerState.setupRuns += 1;
  ext.registerError('notes/RETRY_ME', { description: 'Try again.', title: 'Try again', retryable: true });
  ext.registerCollection('notes', { description: 'Notes.', schema: z.object({ id: z.string(), text: z.string(), tags: z.array(z.string()) }) });
  ext.registerCollection('questions', { description: 'Open questions.', schema: z.object({ id: z.string(), status: z.string() }) });
  ext.registerEvent('notes.added', { description: 'A note was added.', payload: z.object({ id: z.string(), source: z.string().default('user') }) });
  ext.registerEvent('notes.touched', { description: 'A note was touched.', delivery: 'transient', payload: z.object({ id: z.string(), step: z.number() }) });
  ext.registerEvent('notes.text.streamed', { description: 'Text as it streams.', delivery: 'live', chunk: 'text' });
  registerBasics(ext);
  registerCalls(ext);
  registerDeferred(ext);
  registerLive(ext);
  registerQueries(ext);
  registerSupervision(ext);
  registerAdapters(ext);
});
