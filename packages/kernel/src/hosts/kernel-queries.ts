import {
  jsonObjectSchema, manifestSchema, presetSchema, schemaGetRequestSchema, validateRequestSchema, workspaceGetRequestSchema, type HealthResult, type Issue, type Json,
  type Manifest, type Message, type Preset, type Problem,
} from '@kvman/protocol';
import { kernelProblem } from '../problems.ts';
import { configIssues, namespaceIssues, providerIssues, requiresIssues } from '../presets/enabled-checks.ts';
import type { KernelRegistry } from '../registry/kernel-registry.ts';
import { kernelEventPayloads, kernelTypeEntries } from '../registry/kernel-types.ts';
import { builtinComponentEntries } from '../registry/schema-components.ts';
import { schemaDocument } from '../registry/schema-document.ts';
import type { GrantsSource } from '../router/grants.ts';
import type { Connection } from '../storage/driver.ts';
import { readAppliedPreset } from '../storage/preset-changes.ts';
import { kernelValues, workspacePageIssues, workspaceUi } from '../ui/ui-refusal.ts';
import { validateRequest } from '../validation/kernel-validate.ts';
import { isAdministrator } from './administrators.ts';
import type { ExtensionQueries, ExtensionQueryAnswer } from './extension-queries.ts';
import type { InspectionQueries } from './inspection-queries.ts';
import type { LlmQueries } from './llm-queries.ts';
import type { NotificationQueries } from './notification-queries.ts';
import type { SavedPreferences } from '../preferences/user-preferences.ts';
import type { PresetQueries } from './preset-queries.ts';
import type { ProcessQueries } from './process-queries.ts';
import type { TrustService } from './trust-service.ts';
import type { UiQueries } from './ui-queries.ts';
import type { WorkspaceQueries } from './workspace-queries.ts';
import type { QueryAnswer } from './query-path.ts';
import { readWorkspace } from './workspace-rows.ts';

export type KernelQueriesDeps = {
  connection: Connection;
  extensions: ExtensionQueries;
  workspaces: WorkspaceQueries;
  inspection: InspectionQueries;
  processes: ProcessQueries;
  trust: TrustService;
  presets: PresetQueries;
  llm: LlmQueries;
  ui: UiQueries;
  notifications: NotificationQueries;
  preferences: SavedPreferences;
  grants: GrantsSource;
  registry: () => KernelRegistry;
  health: () => HealthResult;
  version: string;
};

// The kernel's own queries (03 §3.8), answered in memory on the main thread like every query (02 §2.3).
export class KernelQueries {
  readonly #deps: KernelQueriesDeps;
  readonly #kernelTypes = kernelTypeEntries();
  readonly #kernelEvents = kernelEventPayloads();
  readonly #components = builtinComponentEntries();

  constructor(deps: KernelQueriesDeps) {
    this.#deps = deps;
  }

  // kernel.trust.preview hashes files, so its answer comes later (07 §7.2).
  answer(message: Message): QueryAnswer | Promise<QueryAnswer> {
    if (message.type === 'kernel.trust.preview') return this.#deps.trust.preview(message);
    if (message.type === 'kernel.workspace.preset.get') return this.#deps.trust.preset(message);
    if (message.type === 'kernel.workspace.get') return this.#workspaceGet(message);
    if (message.type === 'kernel.health.get') return { ok: true, value: this.#deps.health() satisfies Json };
    if (message.type === 'kernel.schema.get') return this.#schema(message);
    if (message.type === 'kernel.validate') return this.#validate(message);
    if (message.type === 'kernel.extensions.list') return this.#extensionAnswer(message, this.#deps.extensions.list(message.payload));
    if (message.type === 'kernel.extension.get') return this.#extensionAnswer(message, this.#deps.extensions.get(message.payload));
    if (message.type === 'kernel.workspaces.list') return this.#extensionAnswer(message, this.#deps.workspaces.list(message.payload));
    if (message.type === 'kernel.config.get') return this.#extensionAnswer(message, this.#deps.workspaces.config(message.payload));
    if (message.type === 'kernel.subscribers.list') return this.#extensionAnswer(message, this.#deps.inspection.subscribers(message.payload));
    if (message.type === 'kernel.processes.list') return this.#extensionAnswer(message, this.#deps.processes.list(message));
    if (message.type === 'kernel.messages.list') return this.#extensionAnswer(message, this.#adminOnly(message, () => this.#deps.inspection.messages(message.payload)));
    if (message.type === 'kernel.presets.list') return this.#extensionAnswer(message, this.#deps.presets.list(message.payload));
    if (message.type === 'kernel.preset.get') return this.#extensionAnswer(message, this.#deps.presets.get(message.payload));
    if (message.type === 'kernel.preset.current.get') return this.#extensionAnswer(message, this.#deps.presets.current(message.payload));
    if (message.type === 'kernel.preset.import.preview') return this.#extensionAnswer(message, this.#deps.presets.importPreview(message.payload));
    if (message.type === 'kernel.preset.export.get') return this.#extensionAnswer(message, this.#deps.presets.export(message.payload));
    if (message.type === 'kernel.llm.models.list') return this.#deps.llm.modelsList(message);
    if (message.type === 'kernel.llm.providers.list') return this.#deps.llm.providersList(message);
    if (message.type === 'kernel.llm.defaults.get') return this.#deps.llm.defaultsGet(message);
    if (message.type === 'kernel.llm.tokens.count') return this.#deps.llm.tokensCount(message);
    if (message.type === 'kernel.llm.usage.get') return this.#deps.llm.usageGet(message);
    if (message.type === 'kernel.ui.get') return this.#deps.ui.registry(message);
    if (message.type === 'kernel.ui.page.get') return this.#deps.ui.page(message);
    if (message.type === 'kernel.ui.translations.get') return this.#deps.ui.translations(message);
    if (message.type === 'kernel.user.preferences.get') return { ok: true, value: this.#deps.preferences.read() };
    if (message.type === 'kernel.notifications.list') return this.#extensionAnswer(message, this.#adminOnly(message, () => this.#deps.notifications.list(message.payload)));
    if (message.type === 'kernel.notifications.count') return { ok: true, value: this.#deps.notifications.count(message.payload) };
    return this.#refused(message, 'INTERNAL', `the kernel has no handler for ${message.type}`);
  }

  // ADR 0150: the gate check runs first, so a gate it just closed reads trust: null below.
  async #workspaceGet(message: Message): Promise<QueryAnswer> {
    const { workspaceId } = workspaceGetRequestSchema.parse(message.payload);
    const repoPreset = await this.#deps.trust.repoPreset(workspaceId);
    const answer = this.#deps.workspaces.get(message.payload);
    if (!answer.ok) return this.#refused(message, answer.code, answer.detail);
    return { ok: true, value: { ...answer.value, repoPreset } };
  }

  // 12 §12.7, ADR 0111: a workspace without a row is refused rather than listed empty.
  #schema(message: Message): QueryAnswer {
    const request = schemaGetRequestSchema.parse(message.payload);
    if (request.workspaceId !== undefined && readWorkspace(this.#deps.connection, request.workspaceId) === undefined) {
      return this.#refused(message, 'WORKSPACE_INVALID', `no workspace ${request.workspaceId} exists`);
    }
    const sources = {
      version: this.#deps.version, kernelTypes: this.#kernelTypes, extensions: this.#deps.registry().listed(request.workspaceId), components: this.#components,
    };
    return { ok: true, value: schemaDocument(sources, request.q) satisfies Json };
  }

  #validate(message: Message): QueryAnswer {
    const request = validateRequestSchema.parse(message.payload);
    const registry = this.#deps.registry();
    const result = validateRequest(request, { kernelEvents: this.#kernelEvents, configSchemas: registry.configSchemas(), values: kernelValues });
    const workspaceId = request.workspaceId;
    if (workspaceId === undefined) return { ok: true, value: result satisfies Json };
    if (readWorkspace(this.#deps.connection, workspaceId) === undefined) {
      return this.#refused(message, 'WORKSPACE_INVALID', `no workspace ${workspaceId} exists`);
    }
    // The structural issues come first; when they contain an error the referential checks do not run.
    if (!result.ok) return { ok: true, value: result satisfies Json };
    // ADRs 0151, 0157: the referential checks against the workspace. A preset replaces the workspace's enabled set;
    // a manifest is added to it; a page is checked as one of the preset's pages.
    let extra: Issue[] = [];
    if ('preset' in request) extra = this.#presetReferential(workspaceId, request.preset, registry);
    else if ('manifest' in request) extra = this.#manifestReferential(workspaceId, request.manifest, registry);
    else if ('page' in request) extra = workspacePageIssues(registry, registry.manifestsEnabledIn(workspaceId), this.#appliedPreset(workspaceId), jsonObjectSchema.parse(request.page));
    const issues = [...result.issues, ...extra];
    return { ok: true, value: { ok: issues.every((issue) => issue.severity === 'warning'), issues } satisfies Json };
  }

  #presetReferential(workspaceId: string, candidate: Json, registry: KernelRegistry): Issue[] {
    const preset = presetSchema.parse(candidate);
    const entries = new Map<string, Manifest | undefined>();
    const enabled: Manifest[] = [];
    const issues: Issue[] = [];
    for (const [name, entry] of Object.entries(preset.extensions)) {
      const manifest = registry.manifestOf(name);
      entries.set(name, manifest);
      if (!entry.enabled) continue;
      if (manifest === undefined) issues.push({ path: `extensions.${name}`, message: `${name} is not installed` });
      else enabled.push(manifest);
    }
    return [
      ...issues,
      ...namespaceIssues(enabled),
      ...providerIssues(enabled),
      ...requiresIssues(enabled),
      ...configIssues({ connection: this.#deps.connection, workspaceId, enabled, entries, config: preset.config }),
      ...workspaceUi(registry, enabled, preset, true).issues,
    ];
  }

  #appliedPreset(workspaceId: string): Preset | undefined {
    return readAppliedPreset(this.#deps, workspaceId)?.preset;
  }

  #manifestReferential(workspaceId: string, candidate: Json, registry: KernelRegistry): Issue[] {
    const manifest = manifestSchema.parse(candidate);
    const enabled = [...registry.manifestsEnabledIn(workspaceId).filter((entry) => entry.meta.name !== manifest.meta.name), manifest];
    return [
      ...namespaceIssues(enabled),
      ...providerIssues(enabled),
      ...requiresIssues(enabled),
      ...configIssues({ connection: this.#deps.connection, workspaceId, enabled: [manifest], entries: new Map(), config: undefined }),
      ...workspaceUi(registry, enabled, this.#appliedPreset(workspaceId), false).issues,
    ];
  }

  // ADR 0132: an admin query answers a person, the kernel, or an extension granted kernel.admin where it runs.
  #adminOnly(message: Message, answer: () => Json): ExtensionQueryAnswer<Json> {
    if (isAdministrator(this.#deps.grants, message)) return { ok: true, value: answer() };
    return { ok: false, code: 'CAPABILITY_DENIED', detail: `${message.source} may not read ${message.type}; it needs kernel.admin` };
  }

  #extensionAnswer(message: Message, answer: ExtensionQueryAnswer<Json>): QueryAnswer {
    return answer.ok ? { ok: true, value: answer.value } : this.#refused(message, answer.code, answer.detail, answer.issues);
  }

  #refused(message: Message, code: 'INTERNAL' | 'WORKSPACE_INVALID' | 'WORKSPACE_UNTRUSTED' | 'PRESET_INVALID' | 'PRESET_UNSHAREABLE' | 'PRESET_SECRET' | 'PRESET_READONLY' | 'PRESET_REQUIRED' | 'NOT_FOUND' | 'CAPABILITY_DENIED', detail: string, issues?: Problem['issues']): QueryAnswer {
    return { ok: false, problem: this.#problem(message, code, detail, issues ?? []) };
  }

  #problem(message: Message, code: 'VALIDATION_FAILED' | 'WORKSPACE_INVALID' | 'WORKSPACE_UNTRUSTED' | 'PRESET_INVALID' | 'PRESET_UNSHAREABLE' | 'PRESET_SECRET' | 'PRESET_READONLY' | 'PRESET_REQUIRED' | 'INTERNAL' | 'NOT_FOUND' | 'CAPABILITY_DENIED', detail: string, issues: Problem['issues']): Problem {
    return kernelProblem(code, { correlationId: message.correlationId, messageId: message.id, detail, ...(issues === undefined || issues.length === 0 ? {} : { issues }) });
  }
}
