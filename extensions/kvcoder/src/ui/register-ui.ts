import { z, type Ctx } from '@kvman/sdk';

// kvcoder's UI (plan 08 §8.7, ADR 0009, 104): the Chat page (the session list and a new conversation), the session
// page, the nav item, and the waiting-sessions status item. kvwebui hosts them; the preset places them.

const sessionParam = { sessionId: { $param: 'sessionId' } };

const settings = (keys: readonly string[]) => keys.map((key) => ({ type: 'setting', key }));

// kvcoder's configuration on its own page of the Extensions list (ADR 0014, 10; ADR 0015, 4 and 7). The shell's two
// settings are in its connector's dialog (ADR 0020, 2).
const configuration = {
  type: 'stack',
  direction: 'vertical',
  children: [
    { type: 'card', title: 'kvcoder.config.agent', children: [{ type: 'custom', component: 'kvcoder.model', props: {} }, ...settings(['kvcoder.thinking', 'kvcoder.maxSteps', 'kvcoder.compactAt', 'kvcoder.compactKeep'])] },
    { type: 'card', title: 'kvcoder.config.chats', children: settings(['kvcoder.sessions.keep', 'kvcoder.welcome']) },
    {
      type: 'card',
      title: 'kvcoder.config.connectors',
      children: [{ type: 'text', text: 'kvcoder.config.connectors.intro' }, { type: 'custom', component: 'kvcoder.connectors', props: {} }],
    },
  ],
};

const contributions = {
  pages: [
    {
      id: 'chat',
      title: 'kvcoder.pages.chat',
      view: {
        type: 'stack',
        direction: 'horizontal',
        children: [
          { type: 'custom', component: 'kvcoder.sessions', props: {} },
          { type: 'custom', component: 'kvcoder.conversation', props: {} },
        ],
      },
    },
    {
      id: 'session',
      title: 'kvcoder.pages.session',
      params: ['sessionId'],
      view: {
        type: 'stack',
        direction: 'horizontal',
        children: [
          { type: 'custom', component: 'kvcoder.sessions', props: sessionParam },
          { type: 'custom', component: 'kvcoder.conversation', props: sessionParam },
        ],
      },
    },
    // Where an MCP server sends the browser back after a sign-in (ADR 0020, 11); it has no nav item.
    { id: 'mcp-sign-in', title: 'kvcoder.pages.mcpSignIn', view: { type: 'custom', component: 'kvcoder.mcp-sign-in', props: {} } },
  ],
  nav: [{ id: 'chat', page: 'chat', title: 'kvcoder.pages.chat', icon: 'message-square', order: 10 }],
  panels: [],
  status: [
    { id: 'waiting', query: 'kvcoder.session.count', input: { status: 'waiting' }, text: 'kvcoder.status.waiting', params: { count: { $output: 'count' } }, order: 10 },
    {
      id: 'chat',
      query: 'kvcoder.session.get',
      input: { sessionId: { $param: 'sessionId' } },
      text: 'kvcoder.status.chat',
      params: { input: { $output: 'usage.input', format: 'compact' }, output: { $output: 'usage.output', format: 'compact' }, cost: { $output: 'usage.cost', format: 'usd' } },
      order: 20,
    },
  ],
  configuration,
};

export function registerUi(ctx: Ctx): void {
  ctx.registerQuery('kvcoder.ui.get', {
    description: "Gives kvcoder's pages, nav item, status items, and configuration.",
    input: z.object({}),
    output: z.json(),
    public: true,
    handle: () => contributions,
  });
}
