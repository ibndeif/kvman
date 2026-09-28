import {
  preferencesGetRequestSchema, preferencesSetRequestSchema, preferencesSetResultSchema, uiGetRequestSchema, uiPageAnswerSchema, uiPageGetRequestSchema,
  uiRegistrySchema, uiTranslationsAnswerSchema, uiTranslationsGetRequestSchema, userPreferencesSchema, type TypeEntry,
} from '@kvman/protocol';
import { command, event, query } from './kernel-workspace-types.ts';

// 03 §3.8, 08 §8.6, §8.16 (M2.11, ADRs 0159–0161).
export function uiTypeEntries(): TypeEntry[] {
  return [
    query('kernel.ui.get', "A workspace's UI registry: its slots and their items, pages, actions, renderers, components, extensions, settings sections, and catalogs.", uiGetRequestSchema, uiRegistrySchema),
    query('kernel.ui.page.get', 'A page view of a workspace with every composite component it uses.', uiPageGetRequestSchema, uiPageAnswerSchema),
    query('kernel.ui.translations.get', "The catalogs of a workspace's extensions and preset for the saved language and its fallbacks.", uiTranslationsGetRequestSchema, uiTranslationsAnswerSchema),
    query('kernel.user.preferences.get', "The person's language, theme, and desktop alerts.", preferencesGetRequestSchema, userPreferencesSchema),
    command('kernel.user.preferences.set', 'user', "Changes the person's language, theme, or desktop alerts; only a person sends it.", preferencesSetRequestSchema, preferencesSetResultSchema),
    event('kernel.user.preferences.changed', "The person's preferences changed.", userPreferencesSchema),
  ];
}
