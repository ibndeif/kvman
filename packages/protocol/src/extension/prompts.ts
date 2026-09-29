import { z } from 'zod';
import { ulidSchema } from '../identifiers.ts';

// ADR 0167: everything ext.registerPrompt derives from a prompt's name `<prefix>.<noun>`.
export type PromptNames = {
  name: string;
  namespace: string;
  noun: string;
  idField: string;
  collection: string;
  list: string;
  answer: string;
  reject: string;
  expire: string;
  asked: string;
  closed: string;
  busy: string;
};

const nounPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

function camelCase(noun: string): string {
  return noun.replace(/-([a-z0-9])/g, (_match, letter: string) => letter.toUpperCase());
}

// Undefined for a name without a dot or whose last segment is not a kebab-case word.
export function promptNames(name: string): PromptNames | undefined {
  const lastDot = name.lastIndexOf('.');
  if (lastDot <= 0) return undefined;
  const prefix = name.slice(0, lastDot);
  const noun = name.slice(lastDot + 1);
  if (!nounPattern.test(noun)) return undefined;
  const namespace = name.slice(0, name.indexOf('.'));
  const plural = `${noun}s`;
  return {
    name, namespace, noun, idField: `${camelCase(noun)}Id`, collection: plural, list: `${prefix}.${plural}.list`,
    answer: `${name}.answer`, reject: `${name}.reject`, expire: `${name}.expire`, asked: `${name}.asked`, closed: `${name}.closed`,
    busy: `${namespace}/BUSY`,
  };
}

export const promptStatusSchema = z.enum(['open', 'answered', 'rejected', 'expired']);

export const closedPromptStatusSchema = z.enum(['answered', 'rejected', 'expired']);

// 02 §2.8: what the kernel sends to a deferred command's onAbort when the command ends without its reply.
export const deferAbortPayloadSchema = z.strictObject({ commandId: ulidSchema, reason: z.enum(['cancelled', 'deadline']) });

export const promptListLimit = 100;

export type PromptObjectSchema = z.ZodObject<z.ZodRawShape, z.core.$ZodObjectConfig>;

export function isObjectSchema(value: unknown): value is PromptObjectSchema {
  return value instanceof z.ZodObject;
}

// Fields the derived inputs already use; undefined when data and answer fit beside them.
export function promptFieldCollision(idField: string, data: PromptObjectSchema, answer: PromptObjectSchema): string | undefined {
  const reserved = ['status', 'limit'].find((field) => field in data.shape);
  if (reserved !== undefined) return `the data field "${reserved}" collides with the list query's own "${reserved}"`;
  if (idField in answer.shape) return `the answer field "${idField}" collides with the prompt's id field`;
  return undefined;
}

// The schemas of the pieces a prompt registers (ADR 0167).
export function promptSchemas(idField: string, data: PromptObjectSchema, answer: PromptObjectSchema) {
  const id = z.strictObject({ [idField]: ulidSchema });
  const document = z.strictObject({
    id: ulidSchema, data, status: promptStatusSchema, answer: answer.exactOptional(), openKey: z.string().exactOptional(),
    openedAt: z.number().int().nonnegative(), closedAt: z.number().int().nonnegative().exactOptional(),
  });
  return {
    document,
    listInput: data.partial().extend({
      status: promptStatusSchema.exactOptional(), limit: z.number().int().min(1).max(promptListLimit).exactOptional(),
    }),
    listOutput: z.strictObject({ items: z.array(document) }),
    answerInput: answer.extend(id.shape),
    rejectInput: id,
    expireInput: deferAbortPayloadSchema,
    asked: id,
    closed: id.extend({ status: closedPromptStatusSchema }),
    done: z.strictObject({}),
  };
}

export type PromptSchemas = ReturnType<typeof promptSchemas>;
