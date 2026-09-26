import { defineExtension } from '@kvman/sdk';
import { registerRun } from './file-operations.ts';

// Holds files.read only (05 §5.7).
export default defineExtension({ name: '@acme/reader', namespace: 'reader', title: 'Reader', description: 'Reads workspace files.' }, (ext) => {
  ext.requestCapability('files.read', { reason: 'Reads workspace files.' });
  registerRun(ext, 'reader.run');
});
