import { z, type Ctx } from '@kvman/sdk';

// kvai's UI contributions (plan 07 §7.3, plan 06 §6.3): the Models page and a status item with the workspace's tokens
// and cost. Every text is a translation key; kvwebui checks view trees when it loads them.

const text = (key: string) => ({ type: 'text', text: key });

const column = (field: string, format: 'text' | 'number' = 'text') => ({ field, title: `kvai.ui.columns.${field}`, format });

const providersView = {
  type: 'table',
  query: 'kvai.provider.list',
  input: {},
  columns: [column('id'), column('title'), column('builtIn'), column('key')],
  empty: 'kvai.ui.providers.empty',
};

const makeDefault = {
  type: 'button',
  text: 'kvai.ui.models.makeDefault',
  command: 'kernel.settings.set',
  input: { key: 'kvai.defaultModel', value: { $row: 'id' }, scope: 'global' },
  style: 'secondary',
  then: { toast: 'kvai.ui.models.defaultSet', level: 'success' },
};

const modelsView = {
  type: 'table',
  query: 'kvai.model.list',
  input: {},
  columns: [column('id'), column('name'), column('contextWindow', 'number'), column('maxTokens', 'number'), column('builtIn')],
  rowActions: [makeDefault],
  empty: 'kvai.ui.models.empty',
};

const addView = {
  type: 'stack',
  direction: 'vertical',
  gap: 'lg',
  children: [
    { type: 'card', title: 'kvai.ui.providers.add', children: [text('kvai.ui.providers.addHelp'), { type: 'form', command: 'kvai.provider.add', submit: 'kvai.ui.providers.addSubmit' }] },
    { type: 'card', title: 'kvai.ui.models.add', children: [{ type: 'form', command: 'kvai.model.add', submit: 'kvai.ui.models.addSubmit' }] },
  ],
};

const modelsPage = {
  id: 'models',
  title: 'kvai.ui.models.title',
  view: {
    type: 'stack',
    direction: 'vertical',
    gap: 'md',
    children: [
      { type: 'heading', text: 'kvai.ui.models.title', level: 1 },
      {
        type: 'tabs',
        tabs: [
          { title: 'kvai.ui.tabs.providers', view: providersView },
          { title: 'kvai.ui.tabs.models', view: modelsView },
          { title: 'kvai.ui.tabs.add', view: addView },
        ],
      },
    ],
  },
};

const contributions = {
  pages: [modelsPage],
  nav: [{ id: 'models', page: 'models', title: 'kvai.ui.models.nav', icon: 'brain', order: 50 }],
  panels: [],
  status: [
    { id: 'usage', query: 'kvai.usage.total.get', input: {}, text: 'kvai.ui.status.usage', params: { tokens: { $output: 'tokens' }, cost: { $output: 'cost' } }, order: 50 },
  ],
};

const contributionsSchema = z.object({
  pages: z.array(z.object({ id: z.string(), title: z.string(), params: z.array(z.string()).exactOptional(), view: z.json() })),
  nav: z.array(z.object({ id: z.string(), page: z.string(), title: z.string(), icon: z.string(), order: z.number() })),
  panels: z.array(z.object({ id: z.string(), title: z.string(), icon: z.string(), view: z.json() })),
  status: z.array(z.object({ id: z.string(), query: z.string(), input: z.json(), text: z.string(), params: z.record(z.string(), z.json()).exactOptional(), order: z.number() })),
});

export function registerUi(ctx: Ctx): void {
  ctx.registerQuery('kvai.ui.get', {
    description: "Gives kvai's UI: the Models page and the usage status item.",
    input: z.object({}),
    output: contributionsSchema,
    public: true,
    handle: () => contributions,
  });
}
