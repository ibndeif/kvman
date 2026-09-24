import { actionPropSchema, blobIdSchema, textPropSchema } from '@kvman/protocol';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { defineExtension, z, type Ext } from '../src/index.ts';

describe('the SDK entry point (plan 05 §5.1, §5.3, ADR 0043)', () => {
  it('M1.3-E12 defineExtension returns a frozen { meta, setup }', () => {
    const meta = { name: '@acme/pdf', namespace: 'pdf', title: 'PDF', description: 'Imports PDF files.' };
    const setup = (ext: Ext): void => {
      ext.requestCapability('ui', { reason: 'Shows notices.' });
    };
    const extension = defineExtension(meta, setup);
    expect(extension).toEqual({ meta, setup });
    expect(extension.meta).toBe(meta);
    expect(extension.setup).toBe(setup);
    expect(Object.isFrozen(extension)).toBe(true);
  });

  it('M1.3-E13 z is Zod plus blobId, text, and action from protocol', () => {
    expect(z.blobId()).toBe(blobIdSchema);
    expect(z.text()).toBe(textPropSchema);
    expect(z.action()).toBe(actionPropSchema);
    expect(z.toJSONSchema(z.object({ blob: z.blobId(), label: z.text(), onOpen: z.action() }))).toMatchObject({
      properties: { blob: { format: 'kvman-blob-id' }, label: { format: 'kvman-text' }, onOpen: { format: 'kvman-action' } },
    });
    const File = z.object({ id: z.string(), pages: z.number().int().optional() });
    expectTypeOf<z.infer<typeof File>>().toEqualTypeOf<{ id: string; pages?: number | undefined }>();
    expect(File.parse({ id: 'f1' })).toEqual({ id: 'f1' });
  });
});
