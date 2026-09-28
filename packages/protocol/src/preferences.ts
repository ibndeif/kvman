import { z } from 'zod';
import { localeSchema } from './extension/grammar.ts';

export const themePreferenceSchema = z.enum(['app', 'system', 'light', 'dark']);
export type ThemePreference = z.infer<typeof themePreferenceSchema>;

export const userPreferencesSchema = z.strictObject({
  locale: localeSchema, theme: themePreferenceSchema, desktopAlerts: z.boolean(),
});
export type UserPreferences = z.infer<typeof userPreferencesSchema>;

export const preferencesGetRequestSchema = z.strictObject({});
export type PreferencesGetRequest = z.infer<typeof preferencesGetRequestSchema>;

export const preferencesSetRequestSchema = z.strictObject({
  locale: z.string().min(1).exactOptional(), theme: themePreferenceSchema.exactOptional(),
  desktopAlerts: z.boolean().exactOptional(),
});
export type PreferencesSetRequest = z.infer<typeof preferencesSetRequestSchema>;

export const preferencesSetResultSchema = z.strictObject({});
export type PreferencesSetResult = z.infer<typeof preferencesSetResultSchema>;
