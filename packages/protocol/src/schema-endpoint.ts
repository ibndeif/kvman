import { z } from 'zod';
import { contractSchema, descriptionSchema, iconNameSchema, jsonSchemaDocumentSchema, namespaceSchema, packageNameSchema, publicNameSchema, semverSchema } from './extension/grammar.ts';
import { agentToolSchema, commandAgentToolSchema, slashSchema } from './extension/manifest-types.ts';
import { typeNameSchema } from './identifiers.ts';
import { jsonSchema } from './json.ts';
import { eventDeliverySchema, messageKindSchema } from './message.ts';
import { errorCodePattern } from './naming/name-patterns.ts';
import { textSchema } from './text.ts';
import { contributionKindSchema, frameSlotSchema } from './ui/frame-slots.ts';

const ownerSchema = z.string().min(1);
const childrenRuleSchema = z.union([z.enum(['none', 'any']), z.array(z.string().min(1))]);

export const schemaDocumentSchema = z.strictObject({
  kernelVersion: semverSchema,
  shellVersion: semverSchema,
  protocolVersion: z.number().int().positive(),
  extensions: z.array(z.strictObject({
    name: packageNameSchema, namespace: namespaceSchema, title: textSchema, description: descriptionSchema,
    icon: iconNameSchema.optional(), implements: z.array(contractSchema).optional(),
  })),
  types: z.array(z.strictObject({
    type: typeNameSchema, kind: messageKindSchema, owner: ownerSchema, namespace: namespaceSchema, description: descriptionSchema,
    input: jsonSchemaDocumentSchema.optional(), output: jsonSchemaDocumentSchema.optional(), examples: z.array(jsonSchema),
    delivery: eventDeliverySchema.optional(), chunk: z.enum(['text', 'value', 'data']).optional(),
    access: z.enum(['all', 'user', 'extensions']).optional(), agentTool: z.union([commandAgentToolSchema, agentToolSchema]).optional(),
    slash: slashSchema.optional(), lane: z.boolean().optional(), scope: z.enum(['workspace', 'global']),
  })),
  entities: z.array(z.strictObject({
    type: publicNameSchema, owner: ownerSchema, description: descriptionSchema, schema: jsonSchemaDocumentSchema,
    display: z.strictObject({ title: textSchema, subtitle: textSchema.optional(), icon: iconNameSchema.optional() }),
  })),
  errors: z.array(z.strictObject({
    code: z.string().regex(errorCodePattern), owner: ownerSchema, description: descriptionSchema, title: z.string().min(1),
    retryable: z.boolean(), hint: z.string().min(1).optional(),
  })),
  contributions: z.array(z.strictObject({
    id: publicNameSchema, kind: contributionKindSchema, owner: ownerSchema, description: descriptionSchema, target: z.string().min(1).optional(),
  })),
  components: z.array(z.strictObject({
    name: z.string().min(1), owner: ownerSchema, form: z.enum(['builtin', 'composite', 'widget']), description: descriptionSchema,
    props: jsonSchemaDocumentSchema, events: z.record(z.string(), z.strictObject({ description: descriptionSchema, value: jsonSchemaDocumentSchema.optional() })),
    children: childrenRuleSchema, parents: z.array(z.string().min(1)).optional(),
    childCount: z.strictObject({ min: z.number().int().nonnegative().optional(), max: z.number().int().positive().optional() }).optional(),
    examples: z.array(jsonSchema), since: semverSchema.optional(),
  })),
  contracts: z.array(z.strictObject({ name: z.string().min(1), major: z.number().int().positive(), types: z.array(typeNameSchema) })),
  frameSlots: z.array(frameSlotSchema),
});
export type SchemaDocument = z.infer<typeof schemaDocumentSchema>;
