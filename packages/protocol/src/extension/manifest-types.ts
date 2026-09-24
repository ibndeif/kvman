import { z } from 'zod';
import { typeNameSchema, typePatternSchema } from '../identifiers.ts';
import { jsonSchema } from '../json.ts';
import { accessSchema, eventDeliverySchema, prioritySchema } from '../message.ts';
import { textSchema } from '../text.ts';
import {
  descriptionSchema, durationSchema, jsonSchemaDocumentSchema, positiveIntegerSchema, privateNameSchema,
} from './grammar.ts';
import { laneTemplateSchema } from './lane-template.ts';

const maxTimeoutMs = 86_400_000;

const timeoutSchema = z.number().int().min(1).max(maxTimeoutMs);

export const slashSchema = z.strictObject({
  name: z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/, 'slash names are lowercase kebab-case'),
  description: textSchema,
  arg: z.string().min(1).optional(),
});

export const agentToolSchema = z.strictObject({
  title: z.string().min(1),
  description: z.string().min(1).optional(),
  resultLimit: positiveIntegerSchema.optional(),
  hiddenFields: z.array(z.string().min(1)).optional(),
});

export const commandAgentToolSchema = agentToolSchema.extend({
  waitMs: positiveIntegerSchema.optional(),
  dangerous: z.boolean().optional(),
  interactive: z.boolean().optional(),
});

const namingExceptionSchema = descriptionSchema.optional();

export const commandEntrySchema = z.strictObject({
  type: typeNameSchema,
  kind: z.literal('command'),
  description: descriptionSchema,
  input: jsonSchemaDocumentSchema,
  output: jsonSchemaDocumentSchema.optional(),
  examples: z.array(jsonSchema).optional(),
  lane: laneTemplateSchema.optional(),
  concurrency: positiveIntegerSchema.optional(),
  timeoutMs: timeoutSchema.optional(),
  maxAttempts: positiveIntegerSchema.optional(),
  priority: prioritySchema.optional(),
  retention: durationSchema.optional(),
  scope: z.enum(['workspace', 'global']).optional(),
  access: accessSchema,
  slash: slashSchema.optional(),
  agentTool: commandAgentToolSchema.optional(),
  namingException: namingExceptionSchema,
  handler: z.string(),
});

export const queryEntrySchema = z.strictObject({
  type: typeNameSchema,
  kind: z.literal('query'),
  description: descriptionSchema,
  input: jsonSchemaDocumentSchema,
  output: jsonSchemaDocumentSchema,
  examples: z.array(jsonSchema).optional(),
  timeoutMs: timeoutSchema.optional(),
  access: accessSchema,
  agentTool: agentToolSchema.optional(),
  namingException: namingExceptionSchema,
  handler: z.string(),
});

export const eventEntrySchema = z.strictObject({
  type: typeNameSchema,
  kind: z.literal('event'),
  description: descriptionSchema,
  delivery: eventDeliverySchema,
  payload: jsonSchemaDocumentSchema.optional(),
  chunk: z.enum(['text', 'value', 'data']).optional(),
  namingException: namingExceptionSchema,
});

export const typeEntrySchema = z
  .discriminatedUnion('kind', [commandEntrySchema, queryEntrySchema, eventEntrySchema])
  .superRefine((entry, check) => {
    if (entry.kind !== 'event') {
      if (entry.handler !== `${entry.kind}:${entry.type}`) {
        check.addIssue({ code: 'custom', path: ['handler'], message: `expected "${entry.kind}:${entry.type}"` });
      }
    } else if (entry.delivery === 'live' && (entry.chunk === undefined || entry.payload !== undefined)) {
      check.addIssue({ code: 'custom', path: ['chunk'], message: 'a live event declares chunk instead of payload' });
    } else if (entry.delivery !== 'live' && entry.chunk !== undefined) {
      check.addIssue({ code: 'custom', path: ['chunk'], message: 'only live events declare chunk' });
    }
  });
export type TypeEntry = z.infer<typeof typeEntrySchema>;

export const subscriptionEntrySchema = z
  .strictObject({
    event: typePatternSchema,
    description: descriptionSchema,
    lane: laneTemplateSchema.optional(),
    concurrency: positiveIntegerSchema.optional(),
    timeoutMs: timeoutSchema.optional(),
    handler: z.string(),
  })
  .superRefine((entry, check) => {
    if (entry.handler !== `subscription:${entry.event}`) {
      check.addIssue({ code: 'custom', path: ['handler'], message: `expected "subscription:${entry.event}"` });
    }
  });

export const scheduleEntrySchema = z
  .strictObject({
    name: privateNameSchema,
    description: descriptionSchema,
    every: durationSchema.optional(),
    cron: z.string().min(1).optional(),
    command: typeNameSchema,
    payload: jsonSchema.optional(),
  })
  .superRefine((entry, check) => {
    if ((entry.every === undefined) === (entry.cron === undefined)) {
      check.addIssue({ code: 'custom', path: ['every'], message: 'a schedule has exactly one of every and cron' });
    }
  });
