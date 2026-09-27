import {
  applyPreviewSchema, presetApplyRequestSchema, presetApplyStageRequestSchema, presetCatalogChangedSchema, presetCurrentGetRequestSchema, presetCurrentGetResultSchema, presetDeleteRequestSchema, presetDeleteResultSchema,
  presetExportRequestSchema, presetGetRequestSchema, presetImportPreviewRequestSchema,
  presetImportPreviewResultSchema, presetImportRequestSchema, presetImportResultSchema, presetRevisionResultSchema, presetSaveRequestSchema, presetSaveResultSchema, presetSchema,
  presetsListRequestSchema, presetsListResultSchema, presetUpdateRequestSchema,
  type TypeEntry,
} from '@kvman/protocol';
import { command, event, query } from './kernel-workspace-types.ts';

// 03 §3.8, 07 §7.4, ADRs 0147 and 0149 (M2.8): the preset catalog queries, the import, save, and delete commands, and the catalog event.
export function presetEntries(): TypeEntry[] {
  return [
    query('kernel.presets.list', 'The preset catalog, sorted by name.', presetsListRequestSchema, presetsListResultSchema),
    query('kernel.preset.get', 'One catalog preset.', presetGetRequestSchema, presetSchema),
    query('kernel.preset.current.get', "A workspace's applied preset, with its config from the workspace's config rows.", presetCurrentGetRequestSchema, presetCurrentGetResultSchema),
    query('kernel.preset.import.preview', 'Checks a preset for import and returns its summary and a confirmation token; inert.', presetImportPreviewRequestSchema, presetImportPreviewResultSchema),
    query('kernel.preset.export.get', 'A preset as shareable JSON: integrity kept, local digests removed; a workspace\'s includes its config.', presetExportRequestSchema, presetSchema),
    command('kernel.preset.import', 'user', 'Adds a previewed preset to the catalog; confirmed in the grant dialog.', presetImportRequestSchema, presetImportResultSchema),
    command('kernel.preset.apply.stage', 'all', 'Stages a preset for a workspace: fetches and checks what it needs and returns the apply preview with a confirmation token. Admin only.', presetApplyStageRequestSchema, applyPreviewSchema),
    command('kernel.preset.apply', 'user', 'Applies a staged preset to its workspace; confirmed in the grant dialog.', presetApplyRequestSchema, presetRevisionResultSchema),
    command('kernel.preset.update', 'all', "Edits a workspace's applied preset with a JSON Merge Patch at its current revision. Admin; a person when the patch touches extensions.", presetUpdateRequestSchema, presetRevisionResultSchema),
    command('kernel.preset.save', 'all', "Saves a workspace's applied preset, with its config, into the catalog. Admin only.", presetSaveRequestSchema, presetSaveResultSchema),
    command('kernel.preset.delete', 'all', 'Deletes a catalog preset; built-in presets cannot be deleted. Admin only.', presetDeleteRequestSchema, presetDeleteResultSchema),
    event('kernel.preset.catalog.changed', 'The preset catalog was written: seeded, imported, saved, or deleted.', presetCatalogChangedSchema),
  ];
}
