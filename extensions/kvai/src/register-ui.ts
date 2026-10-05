import { z, type Ctx } from '@kvman/sdk';

// kvai's UI contributions (plan 07 §7.3, plan 06 §6.3, ADR 0009, 79): the Models page, a page per provider, the Add a
// provider page, and a status item with the workspace's tokens and cost. Every text is a translation key; kvwebui
// checks view trees when it loads them.

const text = (key: string) => ({ type: 'text', text: key });
const providerParam = { $param: 'providerId' };
const backToModels = { type: 'link', text: 'kvai.ui.back', to: { page: 'kvai.models' } };

const modelsPage = {
  id: 'models',
  title: 'kvai.ui.models.title',
  view: {
    type: 'stack',
    direction: 'vertical',
    gap: 'lg',
    children: [
      { type: 'heading', text: 'kvai.ui.models.title', level: 1 },
      text('kvai.ui.models.intro'),
      { type: 'custom', component: 'kvai.providers', props: {} },
    ],
  },
};

const providerPage = {
  id: 'provider',
  title: 'kvai.ui.provider.title',
  params: ['providerId'],
  view: { type: 'custom', component: 'kvai.provider', props: { providerId: providerParam } },
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

// kvai's configuration on its own page of the Extensions list (ADR 0014, 11; ADR 0015, 7).
const configuration = { type: 'card', children: [{ type: 'custom', component: 'kvai.default-model', props: {} }, { type: 'link', text: 'kvai.config.models', to: { page: 'kvai.models' } }] };

const contributions = {
  pages: [modelsPage, providerPage, addPage],
  nav: [{ id: 'models', page: 'models', title: 'kvai.ui.models.nav', icon: 'brain', order: 50 }],
  panels: [],
  status: [
    { id: 'usage', query: 'kvai.usage.total.get', input: {}, text: 'kvai.ui.status.usage', params: { tokens: { $output: 'tokens', format: 'compact' }, cost: { $output: 'cost', format: 'usd' } }, order: 50 },
  ],
  configuration,
};

const contributionsSchema = z.object({
  pages: z.array(z.object({ id: z.string(), title: z.string(), params: z.array(z.string()).exactOptional(), view: z.json() })),
  nav: z.array(z.object({ id: z.string(), page: z.string(), title: z.string(), icon: z.string(), order: z.number() })),
  panels: z.array(z.object({ id: z.string(), title: z.string(), icon: z.string(), view: z.json() })),
  status: z.array(z.object({ id: z.string(), query: z.string(), input: z.json(), text: z.string(), params: z.record(z.string(), z.json()).exactOptional(), order: z.number() })),
  configuration: z.json(),
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
