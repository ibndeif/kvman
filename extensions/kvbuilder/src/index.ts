import type { Ctx } from '@kvman/sdk';
import { registerApp } from './app/register-app.ts';
import { registerAppGuide } from './app/register-app-guide.ts';
import { registerAppReads } from './app/register-app-reads.ts';
import { registerDocs } from './docs/register-docs.ts';
import { registerExt } from './ext/register-ext.ts';
import { registerPreset } from './preset/register-preset.ts';
import { registerPreview } from './preview/register-preview.ts';
import { registerAppQuery } from './query/register-app-query.ts';
import { registerWithKvcoder } from './register-with-kvcoder.ts';

export type {} from './api.ts';

// kvbuilder (plan 09): the harness for developing kvman extensions and presets, and for seeing and changing the app
// itself. It has no loop of its own; it extends kvcoder with the kvman, ext, preset, preview, and docs connectors, and
// the agent reads its guide with `kvman init`.
export default (ctx: Ctx): void => {
  registerApp(ctx);
  registerAppGuide(ctx);
  registerAppReads(ctx);
  registerAppQuery(ctx);
  registerExt(ctx);
  registerPreset(ctx);
  registerPreview(ctx);
  registerDocs(ctx);
  registerWithKvcoder(ctx);
};
