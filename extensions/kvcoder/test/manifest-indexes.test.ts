import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extensionManifestSchema } from '@kvman/sdk';

// The field sets kvcoder filters its growing collections by (plan 08 §8.4, ADR 0088, 3).
const planned = {
  sessions: [['parentId'], ['parentId', 'status'], ['stepJobId']],
  messages: [['sessionId'], ['sessionId', 'block'], ['sessionId', 'kind'], ['sessionId', 'turnId', 'kind']],
  turns: [['sessionId']],
  queued: [['sessionId']],
  questions: [['sessionId']],
  maps: [['sessionId']],
  'step-intents': [['sessionId', 'turnId']],
  'answer-receipts': [['questionId']],
  'send-receipts': [['sendId']],
  'file-views': [['sessionId', 'path']],
  'file-backups': [['sessionId'], ['sessionId', 'path']],
  'file-parts': [['sessionId', 'path'], ['sessionId', 'path', 'part']],
  artifacts: [['sessionId'], ['sessionId', 'artifactId']],
  background: [['sessionId'], ['sessionId', 'ref']],
  runs: [['sessionId'], ['jobId']],
  processes: [['sessionId'], ['sessionId', 'reported'], ['workspaceId']],
};

describe("kvcoder's store indexes (08 §8.4, ADR 0088, 3)", () => {
  it('QA56-H9 kvcoder declares exactly the planned field sets', () => {
    const manifest = extensionManifestSchema.parse(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')));
    expect(manifest.kvman.indexes).toEqual(planned);
  });
});
