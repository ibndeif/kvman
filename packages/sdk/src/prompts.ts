import type { output as Output, ZodObject } from 'zod';
import type { Ctx, Deferred } from './context.ts';

/** A question or approval a person answers, registered with `ext.registerPrompt` (05 §5.5). */
export interface PromptDef<DataSchema extends ZodObject = ZodObject, AnswerSchema extends ZodObject = ZodObject> {
  /** What the prompt asks, in English, for developers. */
  description: string;
  /** What `open` stores with the prompt; its fields are the list query's filters. */
  data: DataSchema;
  /** What the person answers; it becomes the deferred command's reply. */
  answer: AnswerSchema;
  /** At most one prompt is open per returned value; another `open` fails `<namespace>/BUSY`. */
  oneOpenPer?: (data: Output<DataSchema>) => string;
}

/** What `ext.registerPrompt` returns. */
export interface PromptHandle<Data> {
  /** Stores the prompt, publishes `<name>.asked`, and defers the command's reply until the person answers; return it from a command handler. */
  open(ctx: Ctx, data: Data): Promise<Deferred>;
}
