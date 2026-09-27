import { describe, expect, it } from 'vitest';
import {
  applyNoteCodeSchema, applyPreviewSchema, hiddenSummarySchema, presetApplyRequestSchema, presetApplyStageRequestSchema, presetCatalogChangedSchema,
  presetCurrentGetRequestSchema, presetCurrentGetResultSchema, presetDeleteRequestSchema, presetDeleteResultSchema, presetExportRequestSchema,
  presetGetRequestSchema, presetIdSchema, presetImportPreviewRequestSchema, presetImportPreviewResultSchema, presetImportRequestSchema,
  presetImportResultSchema, presetImportTokenClaimsSchema, presetListingSchema, presetSaveRequestSchema, presetSaveResultSchema, presetSchema,
  presetSummarySchema, presetUpdateRequestSchema, presetsListRequestSchema, presetsListResultSchema, previewNameSchema, workspaceGetResultSchema,
  workspacePresetGetRequestSchema, workspacePresetGetResultSchema, workspacePreviewCreateRequestSchema,
} from '../src/index.ts';
import { expectRoundTrip, issuePaths } from './assertions.ts';
import kioskPresetFixture from './fixtures/kiosk-preset.json' with { type: 'json' };

const kioskPreset = presetSchema.parse(kioskPresetFixture);

const workspaceId = 'a'.repeat(64);
const otherWorkspaceId = 'b'.repeat(64);
const digest = 'd'.repeat(64);
const grants = { isolation: 'sandboxed', requested: [{ name: 'llm' }, { name: 'ui' }], derived: { subscribes: [], providesLlm: [] } };
const expiresAt = 1_790_000_060_000;

const hidden = { platform: ['settings.section.agent'], others: 0 };

const summary = {
  preset: { id: 'pdf-kiosk', name: 'PDF Kiosk', description: 'A kiosk-style PDF translation app in Arabic and English.', revision: 1 },
  replaces: { id: 'pdf-legacy', name: 'PDF Legacy' },
  extensions: [{ name: '@acme/pdf', source: 'npm:@acme/pdf@1.4.2', enabled: true, grants }],
  pages: ['preset.help'],
  config: ['@acme/pdf'],
  hidden,
};

const preview = {
  workspaceId,
  preset: { id: 'pdf-kiosk', name: 'PDF Kiosk', revision: 2 },
  replaces: { id: 'pdf-kiosk', name: 'PDF Kiosk', revision: 1 },
  catalogReplaces: { id: 'pdf-legacy', name: 'PDF Legacy' },
  install: [{
    name: '@acme/pdf', source: 'npm:@acme/pdf@1.4.2', version: '1.4.2', digest, isolation: 'sandboxed',
    capabilities: [{ name: 'llm', reason: 'Translate documents' }], derived: { subscribes: ['pdf.translated'], providesLlm: [] },
  }],
  enable: [{ name: '@acme/pdf', version: '1.4.2', grants }],
  disable: ['@acme/legacy'],
  switches: [{
    name: '@acme/pdf', from: '1.4.1', to: '1.4.2',
    workspaces: [{ workspaceId: otherWorkspaceId, name: 'Other', missing: ['llm'], unexpected: [] }],
  }],
  notes: [{ code: 'dependencies-differ', name: '@acme/pdf', params: {} }],
  pages: { added: ['preset.help'], removed: [] },
  config: [{ extension: '@acme/pdf', fields: ['defaultLanguage'] }],
  hidden,
  confirmationToken: 'token-1',
  expiresAt,
};

const workspaceGetResult = {
  id: workspaceId, path: '/home/person/work', name: 'Work', kind: 'normal', trust: null, repoPreset: true,
};

describe('preset lifecycle and preview workspaces (plan 07 §7.1, §7.4, 03 §3.8, ADRs 0147–0150)', () => {
  it('M2.8-E4 the preset lifecycle and preview workspace shapes', () => {
    expectRoundTrip(presetIdSchema, 'pdf-kiosk');
    expectRoundTrip(presetsListRequestSchema, {});
    expectRoundTrip(presetListingSchema, { id: 'pdf-kiosk', name: 'PDF Kiosk', description: 'A kiosk app.', icon: 'languages', builtin: false, revision: 1 });
    expectRoundTrip(presetListingSchema, { id: 'pdf-kiosk', name: 'PDF Kiosk', builtin: true, revision: 2 });
    expectRoundTrip(presetsListResultSchema, [
      { id: 'a-app', name: 'A app', builtin: false, revision: 1 },
      { id: 'pdf-kiosk', name: 'PDF Kiosk', builtin: true, revision: 2 },
    ]);
    expectRoundTrip(presetGetRequestSchema, { presetId: 'pdf-kiosk' });
    expectRoundTrip(presetCurrentGetRequestSchema, { workspaceId });
    expectRoundTrip(presetCurrentGetResultSchema, { preset: kioskPreset, revision: 1 });
    expectRoundTrip(hiddenSummarySchema, hidden);
    expectRoundTrip(presetSummarySchema, summary);
    expectRoundTrip(presetSummarySchema, { ...summary, preset: { id: 'pdf-kiosk', name: 'PDF Kiosk', revision: 1 }, replaces: null });
    expectRoundTrip(presetImportPreviewRequestSchema, { json: kioskPresetFixture });
    expectRoundTrip(presetImportPreviewResultSchema, { summary, issues: [], confirmationToken: 'token-1' });
    expectRoundTrip(presetImportPreviewResultSchema, {
      summary, issues: [{ path: 'extensions.@acme/pdf', message: 'The entry needs review.', severity: 'warning' }], confirmationToken: 'token-1',
    });
    expectRoundTrip(presetImportRequestSchema, { confirmationToken: 'token-1' });
    expectRoundTrip(presetImportResultSchema, { presetId: 'pdf-kiosk' });
    expectRoundTrip(presetImportTokenClaimsSchema, { preset: kioskPreset, expiresAt });
    expectRoundTrip(presetExportRequestSchema, { presetId: 'pdf-kiosk' });
    expectRoundTrip(presetExportRequestSchema, { workspaceId });
    expectRoundTrip(presetApplyStageRequestSchema, { workspaceId, presetId: 'pdf-kiosk' });
    expectRoundTrip(presetApplyStageRequestSchema, { workspaceId, json: kioskPresetFixture });
    expectRoundTrip(applyNoteCodeSchema, 'dependencies-differ');
    expectRoundTrip(applyNoteCodeSchema, 'bundled-builtin');
    expectRoundTrip(applyPreviewSchema, preview);
    const { catalogReplaces: _catalogReplaces, ...previewWithoutCatalog } = preview;
    expectRoundTrip(applyPreviewSchema, { ...previewWithoutCatalog, replaces: null });
    expectRoundTrip(presetApplyRequestSchema, { confirmationToken: 'token-1' });
    expectRoundTrip(presetUpdateRequestSchema, { workspaceId, patch: { app: { title: 'PDF Two' } }, revision: 2 });
    expectRoundTrip(presetSaveRequestSchema, { workspaceId, name: 'PDF Kiosk', description: 'A kiosk app.' });
    expectRoundTrip(presetSaveRequestSchema, { workspaceId, name: 'PDF Kiosk' });
    expectRoundTrip(presetSaveResultSchema, { presetId: 'pdf-kiosk' });
    expectRoundTrip(presetDeleteRequestSchema, { presetId: 'pdf-kiosk' });
    expectRoundTrip(presetDeleteResultSchema, {});
    expectRoundTrip(presetCatalogChangedSchema, { presetId: 'pdf-kiosk', cause: 'save' });
    expectRoundTrip(workspaceGetResultSchema, workspaceGetResult);
    expectRoundTrip(workspaceGetResultSchema, { ...workspaceGetResult, kind: 'preview', trust: null, repoPreset: false });
    expectRoundTrip(previewNameSchema, 'try-1');
    expectRoundTrip(workspacePreviewCreateRequestSchema, { name: 'try-1', from: workspaceId });
    expectRoundTrip(workspacePresetGetRequestSchema, { workspaceId });
    expectRoundTrip(workspacePresetGetResultSchema, { json: kioskPresetFixture });

    expect(issuePaths(applyPreviewSchema, { ...preview, unexpected: true })).toEqual(['']);
    expect(issuePaths(presetUpdateRequestSchema, { workspaceId, patch: {}, revision: 0 })).toEqual(['revision']);
    expect(issuePaths(workspacePreviewCreateRequestSchema, { name: 'Try 1', from: workspaceId })).toEqual(['name']);
    expect(issuePaths(presetIdSchema, 'Pdf_App')).toEqual(['']);
    expect(issuePaths(presetCatalogChangedSchema, { presetId: 'pdf-kiosk', cause: 'update' })).toEqual(['cause']);
    const { repoPreset: _dropped, ...withoutRepoPreset } = workspaceGetResult;
    expect(issuePaths(workspaceGetResultSchema, withoutRepoPreset)).toEqual(['repoPreset']);
  });
});
