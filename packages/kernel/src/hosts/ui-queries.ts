import { uiGetRequestSchema, uiPageGetRequestSchema, uiTranslationsGetRequestSchema, type Message } from '@kvman/protocol';
import type { SavedPreferences } from '../preferences/user-preferences.ts';
import { kernelProblem } from '../problems.ts';
import type { RegistryState } from '../registry/registry-state.ts';
import type { Connection } from '../storage/driver.ts';
import { readAppliedPreset } from '../storage/preset-changes.ts';
import { pageAnswer, translationsAnswer } from '../ui-registry/ui-answers.ts';
import { uiRegistry } from '../ui-registry/ui-registry.ts';
import { registryRevision, translationsTag } from '../ui-registry/registry-revision.ts';
import type { RegistrySources } from '../ui-registry/registry-sources.ts';
import type { QueryAnswer } from './query-path.ts';
import { readWorkspace } from './workspace-rows.ts';

export type UiQueriesDeps = { connection: Connection; registry: RegistryState; preferences: SavedPreferences };

type Sources = { ok: true; sources: RegistrySources; revision: string } | { ok: false; answer: QueryAnswer };

// kernel.ui.get, kernel.ui.page.get, and kernel.ui.translations.get (08 §8.6, ADR 0159). Each answer carries the
// tag the `/ui` routes send as their ETag.
export class UiQueries {
  readonly #deps: UiQueriesDeps;

  constructor(deps: UiQueriesDeps) {
    this.#deps = deps;
  }

  registry(message: Message): QueryAnswer {
    const found = this.#sources(message, uiGetRequestSchema.parse(message.payload).workspaceId);
    if (!found.ok) return found.answer;
    return { ok: true, value: uiRegistry(found.sources, found.revision), etag: found.revision };
  }

  page(message: Message): QueryAnswer {
    const { workspaceId, pageId } = uiPageGetRequestSchema.parse(message.payload);
    const found = this.#sources(message, workspaceId);
    if (!found.ok) return found.answer;
    const answer = pageAnswer(found.sources, pageId);
    if (answer === undefined) return this.#refused(message, 'NOT_FOUND', `no page ${pageId} is active in workspace ${workspaceId}`);
    return { ok: true, value: answer, etag: found.revision };
  }

  translations(message: Message): QueryAnswer {
    const found = this.#sources(message, uiTranslationsGetRequestSchema.parse(message.payload).workspaceId);
    if (!found.ok) return found.answer;
    const locale = this.#deps.preferences.locale();
    return { ok: true, value: translationsAnswer(found.sources, locale), etag: translationsTag(found.revision, locale) };
  }

  #sources(message: Message, workspaceId: string): Sources {
    if (readWorkspace(this.#deps.connection, workspaceId) === undefined) {
      return { ok: false, answer: this.#refused(message, 'WORKSPACE_INVALID', `no workspace ${workspaceId} exists`) };
    }
    const applied = readAppliedPreset(this.#deps, workspaceId);
    if (applied === undefined) {
      return { ok: false, answer: this.#refused(message, 'PRESET_REQUIRED', `workspace ${workspaceId} has no applied preset`, 'choose a preset for the workspace first') };
    }
    const registry = this.#deps.registry.current();
    const enabled = registry.manifestsEnabledIn(workspaceId).map((manifest) => {
      const digest = this.#deps.registry.digestOf(manifest.meta.name);
      if (digest === undefined) throw new Error(`the registry has no active digest for ${manifest.meta.name}`);
      return { manifest, digest, quarantined: registry.isQuarantined(manifest.meta.name) };
    });
    const sources = { workspaceId, preset: applied.preset, presetRevision: applied.revision, enabled };
    return { ok: true, sources, revision: registryRevision(sources) };
  }

  #refused(message: Message, code: 'NOT_FOUND' | 'WORKSPACE_INVALID' | 'PRESET_REQUIRED', detail: string, hint?: string): QueryAnswer {
    return { ok: false, problem: kernelProblem(code, { correlationId: message.correlationId, messageId: message.id, detail, ...(hint === undefined ? {} : { hint }) }) };
  }
}
