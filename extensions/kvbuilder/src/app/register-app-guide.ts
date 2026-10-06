import { z, type Ctx } from '@kvman/sdk';
import { readInstructions } from '../docs/own-docs.ts';

// `kvman init` (plan 09 §9.4, ADR 0023, 2): the guide the agent reads before it changes the app itself. A read: it
// writes nothing and never asks the person.

export function registerAppGuide(ctx: Ctx): void {
  ctx.registerQuery('kvbuilder.app.guide.get', {
    description: 'Gives the guide for changing the app itself: what to ask the person, and how to build an extension and manage the app.',
    public: true,
    input: z.object({}),
    output: z.object({ instructions: z.string() }),
    handle: () => ({ instructions: readInstructions() }),
  });
}
