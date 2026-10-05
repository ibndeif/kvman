import { z } from '@kvman/sdk';

// The payload fields several connectors share (plan 08 §8.3 and §8.5). Every field has a description, since `help`
// shows these schemas to the model (ADR 0011, 10).

export const risky = z
  .boolean()
  .describe("true when this could lose or damage something that isn't your own work, or reaches outside the workspace folder: deleting or overwriting files you didn't create, sudo, a global install, git push --force or reset --hard. The person is asked first. Otherwise false. Left out, it counts as true.")
  .exactOptional();

export const background = z.boolean().describe('true keeps a server or any long-running command running after the call returns; follow it up with the background connector.').exactOptional();

export const timeoutMs = z.number().int().positive().describe('How long the command may run, in milliseconds: 120000 by default, at most 600000. Ignored with background.').exactOptional();

export const edits = z
  .array(z.strictObject({ oldText: z.string().describe('The exact text to replace, as it is now, whitespace and line breaks included. It must occur once.'), newText: z.string().describe('The text that replaces it.') }))
  .min(1)
  .describe('The replacements, applied together. They must not overlap; put several changes to one target in one call.');
