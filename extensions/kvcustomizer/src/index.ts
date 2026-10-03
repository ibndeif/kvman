import type { Ctx } from '@kvman/sdk';
import { registerDocs } from './docs/register-docs.ts';
import { registerExt } from './ext/register-ext.ts';
import { registerPreset } from './preset/register-preset.ts';
import { registerPreview } from './preview/register-preview.ts';
import { registerWithKvcoder } from './register-with-kvcoder.ts';

export type {} from './api.ts';

// kvcustomizer (plan 09): the harness for developing kvman extensions and presets. It has no loop of its own; it extends
// kvcoder with the ext, preset, preview, and docs connectors and one global section.
export default (ctx: Ctx): void => {
  registerExt(ctx);
  registerPreset(ctx);
  registerPreview(ctx);
  registerDocs(ctx);
  registerWithKvcoder(ctx);
};
