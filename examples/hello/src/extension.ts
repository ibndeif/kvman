import { defineExtension, z } from '@kvman/sdk';

export default defineExtension({
  name: '@kvman/example-hello',
  namespace: 'hello',
  title: '$t.title',
  description: 'Greets people by name and counts the greetings.',
}, (ext) => {
  ext.registerCommand('hello.greet', {
    description: 'Greets a person by name in their language and counts the greeting.',
    input: z.object({ name: z.string().min(1).max(100) }),
    output: z.object({ greeting: z.string() }),
    async handle(input, ctx) {
      const count = (await ctx.store.kv.get<number>('count')) ?? 0;
      ctx.store.kv.set('count', count + 1);
      return { greeting: ctx.i18n.t('greeting', { name: input.name }) };
    },
  });

  ext.registerQuery('hello.greetings.count', {
    description: 'Counts the greetings so far in this workspace.',
    input: z.object({}),
    output: z.object({ count: z.number().int().nonnegative() }),
    async handle(_input, ctx) {
      return { count: (await ctx.store.kv.get<number>('count')) ?? 0 };
    },
  });

  ext.registerTranslations({
    default: 'en',
    catalogs: {
      en: { title: 'Hello', greeting: 'Hello, {name}!' },
      ar: { title: 'مرحبا', greeting: 'مرحبا يا {name}!' },
    },
  });
});
