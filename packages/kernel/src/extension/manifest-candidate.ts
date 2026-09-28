import type { JsonObject } from '@kvman/protocol';
import type { ExtensionMeta } from '@kvman/sdk';
import { compact, type Recording } from './recording.ts';

// The manifest of 05 §5.12 before validation, with the defaults of ADR 0013 written out.
export function manifestCandidate(meta: ExtensionMeta, version: string, recording: Recording): JsonObject {
  return {
    manifestVersion: 1,
    meta: compact({
      name: meta.name, version, namespace: meta.namespace, title: meta.title, summary: meta.summary, icon: meta.icon,
      description: meta.description, implements: meta.implements ?? [],
    }),
    permissions: {
      capabilities: recording.capabilities, isolation: recording.isolation,
      requireTypes: recording.requireTypes, requireComponents: recording.requireComponents,
    },
    types: recording.types,
    subscriptions: recording.subscriptions,
    schedules: recording.schedules,
    data: {
      version: recording.dataVersion?.version ?? 1, compatibleWith: recording.dataVersion?.compatibleWith ?? [],
      migrations: recording.migrations, collections: recording.collections, logs: recording.logs,
    },
    entities: recording.entities,
    config: recording.config,
    errors: recording.errors,
    ui: {
      pages: recording.pages, navGroups: recording.navGroups, navItems: recording.navItems, toolbarItems: recording.toolbarItems,
      statusItems: recording.statusItems, panels: recording.panels, slots: recording.slots, actions: recording.actions,
      rendererTargets: recording.rendererTargets, renderers: recording.renderers, components: recording.components,
      settingsSection: recording.settingsSection,
    },
    translations: recording.translations,
    llm: { providers: recording.providers, models: recording.models },
  };
}
