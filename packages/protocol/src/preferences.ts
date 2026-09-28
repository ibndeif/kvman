import { z } from 'zod';
import { localeSchema, packageNameSchema } from './extension/grammar.ts';
import { workspaceIdSchema } from './identifiers.ts';

export const themePreferenceSchema = z.enum(['app', 'system', 'light', 'dark']);
export type ThemePreference = z.infer<typeof themePreferenceSchema>;

export const userPreferencesSchema = z.strictObject({
  locale: localeSchema, theme: themePreferenceSchema, desktopAlerts: z.boolean(),
});
export type UserPreferences = z.infer<typeof userPreferencesSchema>;

// The stored `user_preferences.data` (04 §4.1): the preferences and, per workspace, the extensions whose
// notifications are muted (ADR 0163).
export const storedPreferencesSchema = userPreferencesSchema.extend({
  muted: z.record(workspaceIdSchema, z.array(packageNameSchema)).exactOptional(),
});
export type StoredPreferences = z.infer<typeof storedPreferencesSchema>;

export const preferencesGetRequestSchema = z.strictObject({});
export type PreferencesGetRequest = z.infer<typeof preferencesGetRequestSchema>;

export const preferencesSetRequestSchema = z.strictObject({
  locale: z.string().min(1).exactOptional(), theme: themePreferenceSchema.exactOptional(),
  desktopAlerts: z.boolean().exactOptional(),
});
export type PreferencesSetRequest = z.infer<typeof preferencesSetRequestSchema>;

export const preferencesSetResultSchema = z.strictObject({});
export type PreferencesSetResult = z.infer<typeof preferencesSetResultSchema>;
