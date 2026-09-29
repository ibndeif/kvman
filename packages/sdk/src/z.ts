import { actionPropSchema, blobIdSchema, textPropSchema, type Action } from '@kvman/protocol';
import type { ZodType } from 'zod';

export * from 'zod';

/** A blob id field; handing one over grants read access to that blob. */
export function blobId(): typeof blobIdSchema {
  return blobIdSchema;
}

/** A user-facing `Text` prop of a component: a literal, a `$t` key, or a key with parameters. */
export function text(): typeof textPropSchema {
  return textPropSchema;
}

/** An event prop of a composite component: the using view passes an `Action`. */
export function action(): ZodType<Action> {
  return actionPropSchema;
}
