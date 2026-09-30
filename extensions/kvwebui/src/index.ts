import { z, type Ctx } from '@kvman/sdk';

// kvwebui (plan 06): the web app, served from `dist/web`. The kernel side only declares kvwebui's settings (§6.8);
// everything else runs in the browser.

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
    description: 'The page shown at /, as a full page id without params.',
    schema: z.string().regex(pageIdPattern, 'A home page is <namespace>.<page>.'),
    scopes: [],
  });
  ctx.registerSetting('kvwebui.nav.order', {
    description: 'Full nav ids shown first, in this order.',
    schema: z.array(z.string().min(1)),
    default: [],
  });
  ctx.registerSetting('kvwebui.nav.hidden', {
    description: "Full nav ids that aren't shown.",
    schema: z.array(z.string().min(1)),
    default: [],
  });
  ctx.registerSetting('kvwebui.theme', {
    description: 'Light, dark, or the same as the system.',
    schema: z.enum(['system', 'light', 'dark']),
    default: 'system',
    scopes: ['global'],
  });
};
