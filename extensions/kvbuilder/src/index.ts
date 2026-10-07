import type { Ctx } from '@kvman/sdk';
import { registerApp } from './app/register-app.ts';
import { registerAppPreset } from './app/register-app-preset.ts';
import { registerAppReads } from './app/register-app-reads.ts';
import { registerBuild } from './build/register-build.ts';
import { registerDocs } from './docs/register-docs.ts';
import { registerExt } from './ext/register-ext.ts';
import { registerPreset } from './preset/register-preset.ts';
import { registerPreview } from './preview/register-preview.ts';
import { registerAppQuery } from './query/register-app-query.ts';
import { registerWithKvcoder } from './register-with-kvcoder.ts';

export type {} from './api.ts';

// kvbuilder (plan 09): the harness for developing kvman extensions and presets, and for seeing and changing the app
// itself. It has no loop of its own; it extends kvcoder with the kvman, ext, preset, preview, and docs connectors and
// its guide, which a chat has once the person runs `/build-kvman` in it (ADR 0027).
export default (ctx: Ctx): void => {
  registerApp(ctx);
  registerAppPreset(ctx);
  registerBuild(ctx);
  registerAppReads(ctx);
  registerAppQuery(ctx);
  registerExt(ctx);
  registerPreset(ctx);
  registerPreview(ctx);
  registerDocs(ctx);
  registerWithKvcoder(ctx);
};
