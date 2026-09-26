import { z } from 'zod';
import { contractSchema, descriptionSchema, iconNameSchema, jsonSchemaDocumentSchema, namespaceSchema, packageNameSchema, publicNameSchema, semverSchema } from './extension/grammar.ts';
import { agentToolSchema, commandAgentToolSchema, slashSchema } from './extension/manifest-types.ts';
import { typeNameSchema } from './identifiers.ts';
import { jsonSchema } from './json.ts';
import { eventDeliverySchema, messageKindSchema } from './message.ts';
import { problemCodePattern } from './naming/name-patterns.ts';
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
    icon: iconNameSchema.exactOptional(), implements: z.array(contractSchema).exactOptional(),
  })),
  types: z.array(z.strictObject({
    type: typeNameSchema, kind: messageKindSchema, owner: ownerSchema, namespace: namespaceSchema, description: descriptionSchema,
    input: jsonSchemaDocumentSchema.exactOptional(), output: jsonSchemaDocumentSchema.exactOptional(), examples: z.array(jsonSchema),
    delivery: eventDeliverySchema.exactOptional(), chunk: z.enum(['text', 'value', 'data']).exactOptional(),
    access: z.enum(['all', 'user', 'extensions']).exactOptional(), agentTool: z.union([commandAgentToolSchema, agentToolSchema]).exactOptional(),
    slash: slashSchema.exactOptional(), lane: z.boolean().exactOptional(), scope: z.enum(['workspace', 'global']),
  })),
  entities: z.array(z.strictObject({
    type: publicNameSchema, owner: ownerSchema, description: descriptionSchema, schema: jsonSchemaDocumentSchema,
    display: z.strictObject({ title: textSchema, subtitle: textSchema.exactOptional(), icon: iconNameSchema.exactOptional() }),
  })),
  errors: z.array(z.strictObject({
    code: z.string().regex(problemCodePattern), owner: ownerSchema, description: descriptionSchema, title: z.string().min(1),
    retryable: z.boolean(), hint: z.string().min(1).exactOptional(),
  })),
  contributions: z.array(z.strictObject({
    id: publicNameSchema, kind: contributionKindSchema, owner: ownerSchema, description: descriptionSchema, target: z.string().min(1).exactOptional(),
  })),
  components: z.array(z.strictObject({
    name: z.string().min(1), owner: ownerSchema, form: z.enum(['builtin', 'composite', 'widget']), description: descriptionSchema,
    props: jsonSchemaDocumentSchema, events: z.record(z.string(), z.strictObject({ description: descriptionSchema, value: jsonSchemaDocumentSchema.exactOptional() })),
    children: childrenRuleSchema, parents: z.array(z.string().min(1)).exactOptional(),
    childCount: z.strictObject({ min: z.number().int().nonnegative().exactOptional(), max: z.number().int().positive().exactOptional() }).exactOptional(),
    examples: z.array(jsonSchema), since: semverSchema.exactOptional(),
  })),
  contracts: z.array(z.strictObject({ name: z.string().min(1), major: z.number().int().positive(), types: z.array(typeNameSchema) })),
  frameSlots: z.array(frameSlotSchema),
});
export type SchemaDocument = z.infer<typeof schemaDocumentSchema>;
