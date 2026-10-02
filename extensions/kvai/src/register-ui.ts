import { z, type Ctx } from '@kvman/sdk';

// kvai's UI contributions (plan 07 §7.3, plan 06 §6.3, ADR 0009, 79): the Models page, a page per provider, the Add a
// provider page, and a status item with the workspace's tokens and cost. Every text is a translation key; kvwebui
// checks view trees when it loads them.

const text = (key: string) => ({ type: 'text', text: key });
const providerParam = { $param: 'providerId' };
const backToModels = { type: 'link', text: 'kvai.ui.back', to: { page: 'kvai.models' } };

const providerStatus = {
  ready: { text: 'kvai.ui.status.ready', tone: 'success' },
  needsKey: { text: 'kvai.ui.status.needsKey', tone: 'warning' },
  noKey: { text: 'kvai.ui.status.noKey', tone: 'neutral' },
};

const defaultCard = {
  type: 'card',
  title: 'kvai.ui.default.title',
  children: [
    {
      type: 'detail',
      query: 'kvai.model.default.get',
      input: {},
      fields: [
        { field: 'name', title: 'kvai.ui.columns.model', secondary: 'id' },
        { field: 'ready', title: 'kvai.ui.columns.status', badges: { true: { text: 'kvai.ui.status.ready', tone: 'success' }, false: { text: 'kvai.ui.status.notReady', tone: 'warning' } } },
      ],
    },
    text('kvai.ui.default.help'),
  ],
};

const providersCard = {
  type: 'card',
  title: 'kvai.ui.providers.title',
  children: [
    {
      type: 'table',
      query: 'kvai.provider.list',
      input: {},
      columns: [
        { field: 'title', title: 'kvai.ui.columns.provider', secondary: 'id' },
        { field: 'models', title: 'kvai.ui.columns.models', format: 'number' },
        { field: 'status', title: 'kvai.ui.columns.status', badges: providerStatus },
      ],
      rowLink: { page: 'kvai.provider', params: { providerId: { $row: 'id' } } },
      empty: 'kvai.ui.providers.empty',
    },
  ],
};

const connectCard = {
  type: 'card',
  title: 'kvai.ui.connect.title',
  children: [text('kvai.ui.connect.help'), { type: 'link', text: 'kvai.ui.connect.add', to: { page: 'kvai.provider-add' } }],
};

const modelsPage = {
  id: 'models',
  title: 'kvai.ui.models.title',
  view: {
    type: 'stack',
    direction: 'vertical',
    gap: 'lg',
    children: [{ type: 'heading', text: 'kvai.ui.models.title', level: 1 }, text('kvai.ui.models.intro'), defaultCard, providersCard, connectCard],
  },
};

const makeDefault = {
  type: 'button',
  text: 'kvai.ui.models.makeDefault',
  command: 'kernel.settings.set',
  input: { key: 'kvai.defaultModel', value: { $row: 'id' }, scope: 'global' },
  style: 'secondary',
  then: { toast: 'kvai.ui.models.defaultSet', level: 'success' },
};

const keyCard = {
  type: 'card',
  title: 'kvai.ui.key.title',
  children: [
    { type: 'form', command: 'kvai.provider.key.set', fixed: { provider: providerParam }, submit: 'kvai.ui.key.save', then: { toast: 'kvai.ui.key.saved' } },
    text('kvai.ui.key.help'),
    {
      type: 'button',
      text: 'kvai.ui.key.remove',
      command: 'kvai.provider.key.delete',
      input: { provider: providerParam },
      confirm: 'kvai.ui.key.removeConfirm',
      style: 'danger',
      then: { toast: 'kvai.ui.key.removed' },
    },
  ],
};

const providerModelsCard = {
  type: 'card',
  title: 'kvai.ui.models.title',
  children: [
    {
      type: 'table',
      query: 'kvai.model.list',
      input: { provider: providerParam },
      columns: [
        { field: 'name', title: 'kvai.ui.columns.model', secondary: 'id' },
        { field: 'reasoning', title: 'kvai.ui.columns.reasoning', format: 'boolean' },
        { field: 'contextWindow', title: 'kvai.ui.columns.contextWindow', format: 'number' },
        { field: 'isDefault', title: 'kvai.ui.columns.default', badges: { true: { text: 'kvai.ui.models.default', tone: 'info' } } },
      ],
      rowActions: [makeDefault],
      empty: 'kvai.ui.models.empty',
    },
  ],
};

const providerPage = {
  id: 'provider',
  title: 'kvai.ui.provider.title',
  params: ['providerId'],
  view: {
    type: 'stack',
    direction: 'vertical',
    gap: 'lg',
    children: [
      backToModels,
      {
        type: 'detail',
        query: 'kvai.provider.get',
        input: { id: providerParam },
        fields: [
          { field: 'title', title: 'kvai.ui.columns.provider', secondary: 'id' },
          { field: 'status', title: 'kvai.ui.columns.status', badges: providerStatus },
        ],
      },
      keyCard,
      providerModelsCard,
    ],
  },
};

const addPage = {
  id: 'provider-add',
  title: 'kvai.ui.add.title',
  view: {
    type: 'stack',
    direction: 'vertical',
    gap: 'lg',
    children: [
      backToModels,
      { type: 'heading', text: 'kvai.ui.add.title', level: 1 },
      { type: 'card', title: 'kvai.ui.providers.add', children: [text('kvai.ui.providers.addHelp'), { type: 'form', command: 'kvai.provider.add', submit: 'kvai.ui.providers.addSubmit', then: { toast: 'kvai.ui.providers.added' } }] },
      { type: 'card', title: 'kvai.ui.models.add', children: [{ type: 'form', command: 'kvai.model.add', submit: 'kvai.ui.models.addSubmit', then: { toast: 'kvai.ui.models.added' } }] },
    ],
  },
};

const contributions = {
  pages: [modelsPage, providerPage, addPage],
  nav: [{ id: 'models', page: 'models', title: 'kvai.ui.models.nav', icon: 'brain', order: 50 }],
  panels: [],
  status: [
    { id: 'usage', query: 'kvai.usage.total.get', input: {}, text: 'kvai.ui.status.usage', params: { tokens: { $output: 'tokens', format: 'compact' }, cost: { $output: 'cost', format: 'usd' } }, order: 50 },
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
    description: "Gives kvai's UI: the Models, provider, and Add a provider pages, and the usage status item.",
    input: z.object({}),
    output: contributionsSchema,
    public: true,
    handle: () => contributions,
  });
}
