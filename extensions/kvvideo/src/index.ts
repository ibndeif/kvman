import type { Ctx } from '@kvman/sdk';
import { registerCompose } from './compose/register-compose.ts';
import { registerFonts } from './fonts/register-fonts.ts';
import { registerNarration } from './narration/register-narration.ts';
import { registerRecord } from './record/register-record.ts';
import { registerWithKvcoder } from './register-with-kvcoder.ts';
import { registerSettings } from './settings.ts';
import { registerSetup } from './setup/register-setup.ts';
import { registerUi } from './ui.ts';
import { registerVideoStart } from './video-start.ts';

export type {} from './api.ts';

// kvvideo (plan 16): makes videos of the person's app, recorded in the installed browser, narrated, and captioned. It
// has no loop of its own; it extends kvcoder with the `video` connector and its guide, which a chat has once the
// person runs `/video` in it (ADR 0107).
export default (ctx: Ctx): void => {
  registerSettings(ctx);
  registerUi(ctx);
  registerSetup(ctx);
  registerFonts(ctx);
  registerRecord(ctx);
  registerNarration(ctx);
  registerCompose(ctx);
  registerVideoStart(ctx);
  registerWithKvcoder(ctx);
};
