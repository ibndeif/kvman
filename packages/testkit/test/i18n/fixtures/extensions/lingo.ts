import { defineExtension, z } from '@kvman/sdk';

const empty = z.object({});
const locales = z.object({
  start: z.string().optional(),
  relay: z.string().optional(),
  finish: z.string().optional(),
  tick: z.string().optional(),
});

function problemCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'problem' in error) {
    const { problem } = error;
    if (typeof problem === 'object' && problem !== null && 'code' in problem && typeof problem.code === 'string') return problem.code;
  }
  return 'not-a-problem';
}

export default defineExtension({
  name: '@acme/lingo',
  namespace: 'lingo',
  title: '$t.meta.title',
  description: 'Exercises preferences, message locales, and ICU formatting.',
}, (ext) => {
  ext.registerTranslations({
    default: 'en',
    catalogs: {
      en: {
        meta: { title: 'Lingo' },
        greeting: 'Hello {name}',
        files: '{count, plural, one {# file} other {# files}}',
        'only-en': 'English only',
        bold: 'Click <b>here</b>',
      },
      ar: {
        meta: { title: 'لينغو' },
        greeting: 'مرحبا {name}',
        files: '{count, plural, zero {لا ملفات} one {ملف واحد} two {ملفان} few {# ملفات} many {# ملفًا} other {# ملف}}',
      },
    },
  });
  ext.registerError('lingo/MISSING', { description: 'The requested item does not exist.', title: 'No such item' });

  ext.registerCommand('lingo.start', {
    description: 'Starts a three-command locale chain.',
    input: z.object({ delayMs: z.number().optional(), contextLocale: z.string().optional() }),
    access: 'all',
    handle: async ({ delayMs, contextLocale }, ctx) => {
      ctx.store.kv.set('start', ctx.locale);
      await ctx.command('lingo.relay', {
        ...(delayMs === undefined ? {} : { delayMs }),
        ...(contextLocale === undefined ? {} : { contextLocale }),
      });
      return {};
    },
  });
  ext.registerCommand('lingo.relay', {
    description: 'Relays the locale chain to its final command.',
    input: z.object({ delayMs: z.number().optional(), contextLocale: z.string().optional() }),
    access: 'internal',
    handle: async ({ delayMs, contextLocale }, ctx) => {
      ctx.store.kv.set('relay', ctx.locale);
      ctx.send('lingo.finish', {}, {
        ...(delayMs === undefined ? {} : { delayMs }),
        ...(contextLocale === undefined ? {} : { context: { locale: contextLocale } }),
      });
      return {};
    },
  });
  ext.registerCommand('lingo.finish', {
    description: 'Records the final locale in a command chain.', input: empty, access: 'internal',
    handle: async (_input, ctx) => {
      ctx.store.kv.set('finish', ctx.locale);
      return {};
    },
  });
  ext.registerCommand('lingo.tick', {
    description: 'Records the locale of an hourly schedule run.', input: empty, access: 'internal',
    handle: async (_input, ctx) => {
      ctx.store.kv.set('tick', ctx.locale);
      return {};
    },
  });
  ext.registerSchedule('tick', { description: 'Runs at the start of every hour.', cron: '0 * * * *', command: 'lingo.tick' });
  ext.registerQuery('lingo.locales.get', {
    description: 'Reads every locale recorded by Lingo.', input: empty, output: locales,
    handle: async (_input, ctx) => {
      const start = await ctx.store.kv.get<string>('start');
      const relay = await ctx.store.kv.get<string>('relay');
      const finish = await ctx.store.kv.get<string>('finish');
      const tick = await ctx.store.kv.get<string>('tick');
      return {
        ...(start === undefined ? {} : { start }),
        ...(relay === undefined ? {} : { relay }),
        ...(finish === undefined ? {} : { finish }),
        ...(tick === undefined ? {} : { tick }),
      };
    },
  });
  ext.registerCommand('lingo.say', {
    description: "Formats one of Lingo's translated messages.",
    input: z.object({ key: z.string(), params: z.record(z.string(), z.json()).optional() }),
    access: 'all',
    handle: async ({ key, params }, ctx) => ({ text: ctx.i18n.t(key, params) }),
  });
  ext.registerCommand('lingo.fail', {
    description: "Throws Lingo's registered missing-item problem.", input: z.object({ itemId: z.string() }), access: 'all',
    handle: async ({ itemId }, ctx) => { throw ctx.problem('lingo/MISSING', { params: { itemId } }); },
  });
  ext.registerCommand('lingo.prefer', {
    description: "Attempts to change the person's saved locale.", input: z.object({ locale: z.string() }), access: 'all',
    handle: async ({ locale }, ctx) => {
      try {
        await ctx.command('kernel.user.preferences.set', { locale });
        return { ok: true };
      } catch (error) {
        return { code: problemCode(error) };
      }
    },
  });
  ext.registerCommand('lingo.preferences.read', {
    description: "Reads the person's preferences through the kernel query.", input: empty, access: 'all',
    handle: async (_input, ctx) => ctx.query('kernel.user.preferences.get', {}),
  });
});
