import { z, type Ctx } from '@kvman/sdk';

// New models from pi.dev's live catalog (plan 07 §7.2, ADR 0110). Off while `kvai.catalog.url` is `null`, the
// default; the coder preset sets pi.dev. With a URL at start, kvai refreshes once and every 4 hours.

const empty = z.object({});

export function registerCatalog(ctx: Ctx): void {
  ctx.registerSetting('kvai.catalog.url', {
    description: "The address of the live model catalog new models come from, such as https://pi.dev; null keeps pi-ai's built-in list alone.",
    schema: z.url({ protocol: /^https?$/ }).nullable(),
    default: null,
  });

  ctx.registerCommand('kvai.catalog.refresh', {
    description: "Fetches the live catalog's model lists for every built-in provider and keeps them.",
    input: empty,
    output: empty,
    retries: 0,
    handle: async () => {
      const url = await ctx.settings.get('kvai.catalog.url');
      if (url === null) return {};
      const { refreshCatalog } = await import('./catalog/refresh-catalog.ts');
      await refreshCatalog(ctx, url);
      return {};
    },
  });

  ctx.registerHandler('kernel.started', {
    description: 'Refreshes the live model catalog now and schedules it every 4 hours, when kvai.catalog.url is set.',
    handle: async () => {
      if ((await ctx.settings.get('kvai.catalog.url')) === null) return;
      await ctx.execAsync('kvai.catalog.refresh', {});
      await ctx.schedule('kvai.catalog.refresh', {}, { cron: '0 */4 * * *', key: 'catalog-refresh' });
    },
  });
}
