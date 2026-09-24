import { z } from 'zod';
import { capabilityRequestSchema, isolationRequestSchema } from './extension/capabilities.ts';
import { descriptionSchema, localeSchema, namespaceSchema, packageNameSchema, providerIdSchema, publicNameSchema, semverSchema } from './extension/grammar.ts';
import { sourceSchema } from './extension/source.ts';
import { epochMsSchema, typeNameSchema, typePatternSchema } from './identifiers.ts';
import { accessSchema, messageKindSchema } from './message.ts';
import { issueSchema } from './problem.ts';
import { textSchema } from './text.ts';

export const stageResultSchema = z.strictObject({
  name: packageNameSchema,
  version: semverSchema,
  title: textSchema,
  summary: textSchema.exactOptional(),
  description: descriptionSchema,
  namespace: namespaceSchema,
  source: sourceSchema,
  digest: z.string().regex(/^[0-9a-f]{64}$/),
  integrity: z.string().min(1).exactOptional(),
  capabilities: z.strictObject({
    requested: z.array(capabilityRequestSchema),
    derived: z.strictObject({ subscribes: z.array(typePatternSchema), providesLlm: z.array(providerIdSchema) }),
  }),
  isolation: isolationRequestSchema.nullable(),
  types: z.array(z.strictObject({ type: typeNameSchema, kind: messageKindSchema, access: accessSchema.exactOptional(), agentTool: z.boolean() })),
  contributions: z.array(z.strictObject({ id: publicNameSchema, kind: z.string().min(1), slot: z.string().min(1).exactOptional(), target: z.string().min(1).exactOptional() })),
  warnings: z.array(issueSchema),
  translations: z.record(
    localeSchema,
    z.strictObject({ title: z.string().exactOptional(), summary: z.string().exactOptional(), reasons: z.record(z.string(), z.string()) }),
  ),
  confirmationToken: z.string().min(1),
  expiresAt: epochMsSchema,
});
export type StageResult = z.infer<typeof stageResultSchema>;
