import { availableParallelism } from 'node:os';
import { z } from '@kvman/sdk';
import type { SettingDefinition } from './settings.ts';

// The kernel's own keys, global only (plan 02 §2.8).

export const kernelExtension = '@kvman/kernel';

function kernelSetting(key: string, description: string, schema: z.ZodType, value: unknown): SettingDefinition {
  return { key, extension: kernelExtension, description, schema, defaultValue: { value }, scopes: ['global'] };
}

export function kernelSettingDefinitions(): SettingDefinition[] {
  return [
    kernelSetting('kernel.port', 'The port kvman listens on, from the next start.', z.number().int().min(1).max(65_535), 3737),
    kernelSetting('kernel.workers', 'How many worker threads run jobs, from the next start.', z.number().int().positive(), Math.max(1, availableParallelism() - 1)),
    kernelSetting('kernel.workerConcurrency', 'How many jobs one worker runs at once, from the next start.', z.number().int().positive(), 32),
    kernelSetting('kernel.language', 'The language of the app.', z.string().min(1), 'en'),
    kernelSetting('kernel.jobs.retentionDays', 'How many days finished job rows are kept.', z.number().int().nonnegative(), 7),
    kernelSetting('kernel.web.home', 'The namespace of the extension whose web folder is served at /.', z.string().min(1), 'kvwebui'),
  ];
}
