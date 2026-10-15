import { z, type Ctx } from '@kvman/sdk';
import { registerDocs } from './docs.ts';
import { registerEffects } from './effects/register-effects.ts';

// kvwebui (plan 06): the web app, served from `dist/web`. The kernel side declares kvwebui's settings and keeps the
// effects extensions add for the UI (§6.5, §6.8); everything else runs in the browser.

// A full page id without params: `<namespace>.<page>` (plan 06 §6.3).
const pageIdPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export default (ctx: Ctx): void => {
  ctx.registerSetting('kvwebui.title', {
    description: "The app's title, a translation key shown in the top bar and the browser tab.",
    schema: z.string().min(1),
    default: 'kvwebui.title.default',
    scopes: [],
  });
  ctx.registerSetting('kvwebui.home', {
    description: 'The page shown at /, as a full page id without params; the Extensions page by default.',
    schema: z.string().regex(pageIdPattern, 'A home page is <namespace>.<page>.'),
    default: 'kvwebui.extensions',
    scopes: [],
  });
  ctx.registerSetting('kvwebui.nav.order', {
    description: 'Full nav ids shown first, in this order.',
    schema: z.array(z.string().min(1)),
    default: [],
  });
  ctx.registerSetting('kvwebui.nav.hidden', {
    description: "Full nav ids that aren't shown, kvwebui.settings and kvwebui.extensions included.",
    schema: z.array(z.string().min(1)),
    default: [],
  });
  ctx.registerSetting('kvwebui.status.hidden', {
    description: 'Status items not shown: full ids of contributed items, and kvwebui.folder for the workspace folder.',
    schema: z.array(z.string().min(1)),
    default: [],
    scopes: [],
  });
  ctx.registerSetting('kvwebui.workspacePicker', {
    description: 'Whether the top bar shows the workspace picker.',
    schema: z.boolean(),
    default: true,
    scopes: [],
  });
  ctx.registerSetting('kvwebui.theme', {
    description: 'Light, dark, or the same as the system.',
    schema: z.enum(['system', 'light', 'dark']),
    default: 'system',
    scopes: ['global'],
  });
  registerEffects(ctx);
  registerDocs(ctx);
};
