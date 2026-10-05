import { z, type Ctx } from '@kvman/sdk';
import { thinkingSchema } from './schemas/records.ts';
import { binaryConnectorSchema, wordSchema } from './schemas/registry.ts';

// kvcoder's settings (plan 08 §8.7).
export const settingSchemas = {
  model: z.string().min(1).nullable(),
  thinking: thinkingSchema,
  maxSteps: z.number().int().positive(),
  approval: z.enum(['ask', 'auto']),
  shellPath: z.string().min(1).nullable(),
  compactAt: z.number().gt(0).max(1),
  connectors: z.array(binaryConnectorSchema),
  disabledConnectors: z.array(wordSchema),
  keep: z.number().int().nonnegative(),
  welcome: z.string().min(1).nullable(),
};

export function registerSettings(ctx: Ctx): void {
  ctx.registerSetting('kvcoder.model', { description: 'The model a new session starts with; null uses kvai.defaultModel.', schema: settingSchemas.model, default: null });
  ctx.registerSetting('kvcoder.thinking', { description: 'How hard the model thinks in a new session.', schema: settingSchemas.thinking, default: 'medium' });
  ctx.registerSetting('kvcoder.maxSteps', { description: 'The most steps a turn takes before it stops.', schema: settingSchemas.maxSteps, default: 50 });
  ctx.registerSetting('kvcoder.shell.approval', { description: 'Whether shell and file calls ask the person first: only the ones the model marks risky (auto), or every one (ask).', schema: settingSchemas.approval, default: 'auto' });
  ctx.registerSetting('kvcoder.shell.path', { description: 'The shell program to run; null finds bash, or pwsh then powershell.exe on Windows.', schema: settingSchemas.shellPath, default: null });
  ctx.registerSetting('kvcoder.compactAt', { description: "The share of the model's context window above which older messages are summarized.", schema: settingSchemas.compactAt, default: 0.8 });
  ctx.registerSetting('kvcoder.connectors', { description: 'Binary connectors to add: programs the agent runs in the real shell.', schema: settingSchemas.connectors, default: [] });
  ctx.registerSetting('kvcoder.connectors.disabled', { description: 'The names of the connectors that are turned off: the agent neither sees nor calls them.', schema: settingSchemas.disabledConnectors, default: [] });
  ctx.registerSetting('kvcoder.sessions.keep', { description: 'How many top-level sessions to keep per workspace; 0 keeps every session.', schema: settingSchemas.keep, default: 0 });
  ctx.registerSetting('kvcoder.welcome', { description: "The translation key of a new workspace's welcome note; null (the default) for no welcome.", schema: settingSchemas.welcome, default: null });
}

/** The names of the connectors that are turned off in the job's workspace (ADR 0014, 7). */
export async function disabledConnectors(ctx: Ctx): Promise<Set<string>> {
  return new Set(settingSchemas.disabledConnectors.parse(await ctx.settings.get('kvcoder.connectors.disabled')));
}

/** The settings a step reads, parsed. */
export async function readSettings(ctx: Ctx) {
  const read = async <Schema extends z.ZodType>(key: string, schema: Schema): Promise<z.output<Schema>> => schema.parse(await ctx.settings.get(key));
  return {
    maxSteps: await read('kvcoder.maxSteps', settingSchemas.maxSteps),
    approval: await read('kvcoder.shell.approval', settingSchemas.approval),
    shellPath: await read('kvcoder.shell.path', settingSchemas.shellPath),
    compactAt: await read('kvcoder.compactAt', settingSchemas.compactAt),
    connectors: await read('kvcoder.connectors', settingSchemas.connectors),
  };
}

export type StepSettings = Awaited<ReturnType<typeof readSettings>>;
