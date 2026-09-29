import { defineExtension } from '@kvman/sdk';

// No default export on purpose: createTestKernel rejects this module (M2.13-E3).
export const extension = defineExtension({
  name: '@acme/no-default',
  namespace: 'no-default',
  title: 'No default',
  summary: 'Exports no default.',
  description: 'Has only a named export, so the test kernel rejects it.',
}, () => undefined);
