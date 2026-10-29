import { z, type Ctx } from '@kvman/sdk';
import { shippedWorkers, workersSchema } from './delegate/workers.ts';
import { mcpServersSchema } from './mcp/servers.ts';
import { thinkingSchema } from './schemas/records.ts';
import { binaryConnectorSchema, wordSchema } from './schemas/registry.ts';
import { approvalRuleSchema } from './schemas/approval-rule.ts';
import { checkSchema } from './schemas/check.ts';

/** A preset's agent profile (ADR 0082, 11): who the agent is, how it works, and the Chat page's words, as translation keys. */
const profileSchema = z.strictObject({
  identity: z.string().min(1).max(4000).exactOptional(),
  method: z.enum(['engineering', 'general']).exactOptional(),
  startHeading: z.string().min(1).exactOptional(),
  placeholder: z.string().min(1).exactOptional(),
});

// kvcoder's settings (plan 08 §8.7).
export const settingSchemas = {
  model: z.string().min(1).nullable(),
  thinking: thinkingSchema,
  maxSteps: z.number().int().positive().nullable(),
  approval: z.enum(['ask', 'auto', 'never']),
  allowed: z.array(approvalRuleSchema).max(200),
  check: checkSchema,
  fallbackModel: z.string().min(1).nullable(),
  preferences: z.string().refine((text) => Buffer.byteLength(text, 'utf8') <= 16_384, 'The preferences hold at most 16 KB.'),
  shellPath: z.string().min(1).nullable(),
  compactAt: z.number().gt(0).max(1),
  compactKeep: z.number().int().min(1).max(100),
  connectors: z.array(binaryConnectorSchema),
  disabledConnectors: z.array(wordSchema),
  mcpServers: mcpServersSchema,
  workers: workersSchema,
  keep: z.number().int().nonnegative(),
  profile: profileSchema,
};

export function registerSettings(ctx: Ctx): void {
  ctx.registerSetting('kvcoder.model', { description: 'The model a new session starts with; null uses kvai.defaultModel.', schema: settingSchemas.model, default: null });
  ctx.registerSetting('kvcoder.delegate.model', { description: "The model a helper uses when its worker names none; null uses the chat's own.", schema: settingSchemas.model, default: null });
  ctx.registerSetting('kvcoder.thinking', { description: 'How hard the model thinks in a new session.', schema: settingSchemas.thinking, default: 'medium' });
  ctx.registerSetting('kvcoder.delegate.thinking', { description: "How hard a helper thinks when its worker names no level (ADR 0102, 3).", schema: settingSchemas.thinking, default: 'medium' });
  ctx.registerSetting('kvcoder.delegate.thinkingLimit', { description: 'The highest level any helper thinks at, whatever its worker or the chat names (ADR 0108, 3).', schema: settingSchemas.thinking, default: 'high' });
  ctx.registerSetting('kvcoder.maxSteps', { description: 'The most steps a turn takes before it stops; null sets no limit.', schema: settingSchemas.maxSteps, default: null });
  ctx.registerSetting('kvcoder.approval', { description: 'When a call asks the person first: only the ones the model marks risky (auto), every one that can ask (ask), or none at all (never).', schema: settingSchemas.approval, default: 'auto' });
  ctx.registerSetting('kvcoder.approval.allowed', { description: 'The approval rules: a line whose every command starts with one of these prefixes, or a file change, runs without asking.', schema: settingSchemas.allowed, default: [] });
  ctx.registerSetting('kvcoder.preferences', { description: "The person's standing preferences, sent in every chat's prompt.", schema: settingSchemas.preferences, default: '' });
  ctx.registerSetting('kvcoder.check', { description: 'A line run after a reply that changed files, such as the project\'s type check; its exit code and output end the change\'s result.', schema: settingSchemas.check, default: null });
  ctx.registerSetting('kvcoder.fallbackModel', { description: 'The model a chat moves to when its model reaches a usage limit, or a rate limit after all tries; null for none.', schema: settingSchemas.fallbackModel, default: null });
  ctx.registerSetting('kvcoder.shell.path', { description: 'The shell program to run; null finds bash, or pwsh then powershell.exe on Windows.', schema: settingSchemas.shellPath, default: null });
  ctx.registerSetting('kvcoder.compactAt', { description: "The share of the model's context window above which older messages are summarized.", schema: settingSchemas.compactAt, default: 0.6 });
  ctx.registerSetting('kvcoder.compactKeep', { description: 'How many of the newest messages stay whole when older messages are summarized.', schema: settingSchemas.compactKeep, default: 10 });
  ctx.registerSetting('kvcoder.connectors', { description: 'Binary connectors to add: programs the agent runs in the real shell.', schema: settingSchemas.connectors, default: [] });
  ctx.registerSetting('kvcoder.connectors.disabled', { description: 'The names of the connectors that are turned off: the agent neither sees nor calls them.', schema: settingSchemas.disabledConnectors, default: [] });
  ctx.registerSetting('kvcoder.mcp.servers', { description: "The MCP servers the mcp connector reaches: a command or an address each, with the names of its secret variables or headers.", schema: settingSchemas.mcpServers, default: [] });
  ctx.registerSetting('kvcoder.delegate.workers', { description: 'The workers the delegate connector hands tasks to: each with its instructions, connectors, model, and whether it is turned on.', schema: settingSchemas.workers, default: shippedWorkers });
  ctx.registerSetting('kvcoder.sessions.keep', { description: 'How many top-level sessions to keep per workspace; 0 keeps every session.', schema: settingSchemas.keep, default: 0 });
  ctx.registerSetting('kvcoder.artifacts.keepDays', { description: "How many days an idle chat's artifact is kept after its last change; 0 keeps every artifact.", schema: settingSchemas.keep, default: 0 });
  ctx.registerSetting('kvcoder.profile', { description: "A product's agent: who it is, how it works (engineering or general), and the Chat page's heading and placeholder as translation keys.", schema: settingSchemas.profile, default: {}, scopes: [] });
}

/** The preset's agent profile, with the engineering method when it names none. */
export async function agentProfile(ctx: Ctx): Promise<{ identity?: string; method: 'engineering' | 'general' }> {
  const profile = settingSchemas.profile.parse(await ctx.settings.get('kvcoder.profile'));
  return { ...(profile.identity === undefined ? {} : { identity: profile.identity }), method: profile.method ?? 'engineering' };
}

/** The names of the connectors that are turned off in the job's workspace (ADR 0014, 7); the general method has no execution map (ADR 0082, 11). */
export async function disabledConnectors(ctx: Ctx): Promise<Set<string>> {
  const disabled = new Set(settingSchemas.disabledConnectors.parse(await ctx.settings.get('kvcoder.connectors.disabled')));
  if ((await agentProfile(ctx)).method === 'general') disabled.add('execution-map');
  return disabled;
}

/** The settings a step reads, parsed. */
export async function readSettings(ctx: Ctx) {
  const read = async <Schema extends z.ZodType>(key: string, schema: Schema): Promise<z.output<Schema>> => schema.parse(await ctx.settings.get(key));
  return {
    maxSteps: await read('kvcoder.maxSteps', settingSchemas.maxSteps),
    approval: await read('kvcoder.approval', settingSchemas.approval),
    allowed: await read('kvcoder.approval.allowed', settingSchemas.allowed),
    check: await read('kvcoder.check', settingSchemas.check),
    fallbackModel: await read('kvcoder.fallbackModel', settingSchemas.fallbackModel),
    shellPath: await read('kvcoder.shell.path', settingSchemas.shellPath),
    compactAt: await read('kvcoder.compactAt', settingSchemas.compactAt),
    compactKeep: await read('kvcoder.compactKeep', settingSchemas.compactKeep),
    connectors: await read('kvcoder.connectors', settingSchemas.connectors),
  };
}

export type StepSettings = Awaited<ReturnType<typeof readSettings>>;
