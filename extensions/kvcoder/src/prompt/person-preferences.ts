import type { Ctx } from '@kvman/sdk';
import { ownerName } from '../jobs/process-records.ts';
import type { Section } from '../registry/register-sections.ts';
import { settingSchemas } from '../register-settings.ts';

// The person's standing preferences (plan 08 §8.2, ADR 0092, 3): `kvcoder.preferences`, sent in every chat's prompt
// right after the base prompt, as a section that counts with the others. Only the person writes it.

const opening = "These are the person's own standing preferences for every chat. Follow them unless the person says otherwise in this chat.";

/** The preferences as a prompt section, or none when they are empty. */
export async function preferencesSection(ctx: Ctx): Promise<Section[]> {
  const text = settingSchemas.preferences.parse(await ctx.settings.get('kvcoder.preferences')).trim();
  if (text === '') return [];
  const content = `${opening}\n\n${text}`;
  return [{ id: 'person-preferences', title: "The person's preferences", order: Number.MIN_SAFE_INTEGER, owner: ownerName, global: true, sessionId: null, content, size: Buffer.byteLength(content, 'utf8') }];
}
