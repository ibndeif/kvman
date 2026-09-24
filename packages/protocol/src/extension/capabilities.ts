import { z } from 'zod';
import { typePatternSchema } from '../identifiers.ts';
import { textSchema } from '../text.ts';
import { providerIdSchema } from './grammar.ts';

export const isolationSchema = z.enum(['shared', 'dedicated', 'sandboxed']);
export type Isolation = z.infer<typeof isolationSchema>;

export const requestedIsolationSchema = z.enum(['shared', 'dedicated']);

export const plainCapabilityNameSchema = z.enum([
  'tools', 'llm', 'ui', 'files.read', 'files.write', 'process', 'network', 'kernel.admin',
]);

export const capabilityNameSchema = z.enum(['calls', ...plainCapabilityNameSchema.options]);
export type CapabilityName = z.infer<typeof capabilityNameSchema>;

const callPatternsSchema = z.array(typePatternSchema).min(1);

export const grantedCapabilitySchema = z.union([
  z.strictObject({ name: z.literal('calls'), types: callPatternsSchema }),
  z.strictObject({ name: plainCapabilityNameSchema }),
]);

export const capabilitiesSchema = z.strictObject({
  isolation: isolationSchema,
  requested: z.array(grantedCapabilitySchema),
  derived: z.strictObject({
    subscribes: z.array(typePatternSchema),
    providesLlm: z.array(providerIdSchema),
  }),
});
export type Capabilities = z.infer<typeof capabilitiesSchema>;

export const capabilityRequestSchema = z.union([
  z.strictObject({ name: z.literal('calls'), reason: textSchema, types: callPatternsSchema }),
  z.strictObject({ name: plainCapabilityNameSchema, reason: textSchema }),
]);
export type CapabilityRequest = z.infer<typeof capabilityRequestSchema>;

export const isolationRequestSchema = z.strictObject({ mode: requestedIsolationSchema, reason: textSchema });
