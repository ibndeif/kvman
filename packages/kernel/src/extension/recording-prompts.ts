import {
  isObjectSchema, promptFieldCollision, promptNames, promptSchemas, type Issue, type PromptNames, type PromptObjectSchema,
} from '@kvman/protocol';
import type { Ext, PromptHandle } from '@kvman/sdk';
import { kernelProblem, ProblemError } from '../problems.ts';
import { promptHandlers, type PromptKey } from './prompt-handlers.ts';
import type { Recording } from './recording.ts';

// What registerPrompt receives: extension code is untyped at runtime, so every part is checked before use.
export type PromptInput = { description: unknown; data: unknown; answer: unknown; oneOpenPer?: unknown };

type CheckedPrompt = { names: PromptNames; description: string; data: PromptObjectSchema; answer: PromptObjectSchema; key: PromptKey | undefined };

function isKeyFunction(value: unknown): value is PromptKey {
  return typeof value === 'function';
}

function checked(name: string, definition: PromptInput, path: string): CheckedPrompt | Issue {
  const names = promptNames(name);
  if (names === undefined) return { path, message: `"${name}" is not a prompt name`, hint: 'name a prompt <namespace>.<noun>, such as "interviewer.question"' };
  const { description, data, answer, oneOpenPer } = definition;
  if (typeof description !== 'string') return { path, message: `the prompt ${name} has no description`, hint: 'describe the prompt in a sentence' };
  if (!isObjectSchema(data) || !isObjectSchema(answer)) {
    return { path, message: `the data and answer of the prompt ${name} must be object schemas`, hint: 'use z.object({ … }) for data and answer' };
  }
  const collision = promptFieldCollision(names.idField, data, answer);
  if (collision !== undefined) return { path, message: `the prompt ${name}: ${collision}`, hint: 'rename the field' };
  if (oneOpenPer !== undefined && !isKeyFunction(oneOpenPer)) return { path, message: `oneOpenPer of the prompt ${name} must be a function`, hint: 'pass (data) => string' };
  return { names, description, data, answer, key: oneOpenPer };
}

// ADR 0167: a prompt is ordinary registrations, recorded through the same ext calls, so the manifest has no prompt
// section and validation checks each piece at its own path.
export function registerPrompt(ext: Ext, recording: Recording, name: string, definition: PromptInput): PromptHandle<unknown> {
  const prompt = checked(name, definition, `types.${recording.types.length}`);
  if ('path' in prompt) {
    recording.issues.push(prompt);
    const detail = `the prompt ${name} was not registered: ${prompt.message}`;
    return { open: (ctx) => Promise.reject(new ProblemError(kernelProblem('EXT_MANIFEST_INVALID', { correlationId: ctx.message.correlationId, detail }))) };
  }
  const { names, description } = prompt;
  const schemas = promptSchemas(names.idField, prompt.data, prompt.answer);
  const handlers = promptHandlers(names, schemas, prompt.key);
  ext.registerCollection(names.collection, {
    description: `The ${names.noun} prompts: ${description}`, schema: schemas.document, indexes: [['status', 'openedAt'], ['openKey']],
  });
  ext.registerQuery(names.list, {
    description: `Lists the ${names.noun} prompts, oldest first, by status and by equal data fields.`,
    input: schemas.listInput, output: schemas.listOutput, handle: handlers.list,
  });
  ext.registerCommand(names.answer, {
    description: `Answers an open ${names.noun} prompt; only a person may.`, input: schemas.answerInput, output: schemas.done, access: 'user',
    handle: handlers.answer,
  });
  ext.registerCommand(names.reject, {
    description: `Rejects an open ${names.noun} prompt; only a person may.`, input: schemas.rejectInput, output: schemas.done, access: 'user',
    handle: handlers.reject,
  });
  ext.registerCommand(names.expire, {
    description: `Closes a ${names.noun} prompt whose command was cancelled or passed its deadline.`, input: schemas.expireInput,
    output: schemas.done, access: 'internal', handle: handlers.expire,
  });
  ext.registerEvent(names.asked, { description: `A ${names.noun} prompt was opened.`, payload: schemas.asked });
  ext.registerEvent(names.closed, { description: `A ${names.noun} prompt was answered, rejected, or expired.`, payload: schemas.closed });
  if (prompt.key !== undefined && !recording.busyErrorRegistered) {
    recording.busyErrorRegistered = true;
    ext.registerError(names.busy, {
      description: 'A prompt with the same oneOpenPer value is still open.', title: 'Another prompt is already open',
      hint: 'answer or close the open prompt first',
    });
  }
  return { open: handlers.open };
}
