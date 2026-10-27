import type { Ctx } from '@kvman/sdk';
import { programSetting, type ProgramName } from '../settings.ts';
import type { Program } from './run-program.ts';

/** A program as its setting names it (plan 16 §16.2, ADR 0107, 20). */
export async function programOf(ctx: Ctx, name: ProgramName): Promise<Program> {
  return { name, command: await ctx.settings.get(programSetting(name)) };
}
