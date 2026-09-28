import type { Ctx } from '@kvman/sdk';

// ctx.ui (05 §5.4, 08 §8.11): each member is ctx.send of its ui.* type, so it waits in the unit of work and is
// admitted at commit, where the `ui` capability and its buttons are checked (ADR 0162).
export function createUi(send: Ctx['send']): Ctx['ui'] {
  return {
    toast: (toast) => send('ui.toast', toast),
    notify: (notification) => send('ui.notify', notification),
    dismiss: (key) => send('ui.dismiss', { key }),
    navigate: (route) => send('ui.navigate', { route }),
  };
}
