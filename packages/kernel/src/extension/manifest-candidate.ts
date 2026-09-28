import type { JsonObject } from '@kvman/protocol';
import type { ExtensionMeta } from '@kvman/sdk';
import { compact, type Recording } from './recording.ts';

const emptyUi = {
  pages: [], navGroups: [], navItems: [], toolbarItems: [], statusItems: [], panels: [], slots: [], actions: [],
  rendererTargets: [], renderers: [], components: [], settingsSection: null,
};

// The manifest of 05 §5.12 before validation, with the defaults of ADR 0013 written out. UI and translations
// are not recorded yet, so their sections are empty.
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
    ui: emptyUi,
    translations: null,
    llm: { providers: recording.providers, models: recording.models },
  };
}
