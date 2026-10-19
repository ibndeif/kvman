import { z } from '@kvman/sdk';

// The payload fields several connectors share (plan 08 §8.3 and §8.5). Every field has a description, since `help`
// shows these schemas to the model (ADR 0011, 10).

export const risky = z
  .boolean()
  .describe("false for the ordinary work of the task: a file inside the workspace folder that the task needs, whoever made it and whether or not there are uncommitted changes (fs undo takes it back), or the project's own build, tests, and tools. true when this could do what is hard to take back or reaches past the task: anything outside the workspace folder, deleting files, a file that holds secrets, sudo, an install outside the project, git push --force, reset, checkout, restore, stash drop, or clean, or sending something out. The person is then asked first.");

export const background = z.boolean().describe('true keeps a server or any long-running command running after the call returns; follow it up with the background connector.').exactOptional();

/** A number that bounds how long or how much, cut into its range instead of refused (ADR 0090, 4). */
export const cutInto = (value: number, least: number, most: number): number => Math.min(Math.max(value, least), most);

export const timeoutMs = z.number().int().positive().describe('How long the command may run, in milliseconds: 120000 by default, at most 600000. Ignored with background.').exactOptional();

export const edits = z
  .array(
    z.strictObject({
      oldText: z.string().describe('The exact text to replace, as it is now, whitespace and line breaks included. It must occur once, unless replaceAll is true.'),
      newText: z.string().describe('The text that replaces it.'),
      replaceAll: z.boolean().describe('true replaces every occurrence of oldText, such as a name used in many places; it must occur at least once.').exactOptional(),
    }),
  )
  .min(1)
  .describe('The replacements, applied together. They must not overlap; put several changes to one target in one call.');
