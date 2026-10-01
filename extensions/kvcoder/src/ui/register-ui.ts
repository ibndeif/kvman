import { z, type Ctx } from '@kvman/sdk';

// kvcoder's UI (plan 08 §8.7, ADR 0009, 104): the Chat page (the session list and a new conversation), the session
// page, the nav item, and the waiting-sessions status item. kvwebui hosts them; the preset places them.

const sessionParam = { sessionId: { $param: 'sessionId' } };

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
  ],
  nav: [{ id: 'chat', page: 'chat', title: 'kvcoder.pages.chat', icon: 'message-square', order: 10 }],
  panels: [],
  status: [{ id: 'waiting', query: 'kvcoder.session.count', input: { status: 'waiting' }, text: 'kvcoder.status.waiting', params: { count: { $output: 'count' } }, order: 10 }],
};

export function registerUi(ctx: Ctx): void {
  ctx.registerQuery('kvcoder.ui.get', {
    description: "Gives kvcoder's pages, nav item, and status item.",
    input: z.object({}),
    output: z.json(),
    public: true,
    handle: () => contributions,
  });
}
