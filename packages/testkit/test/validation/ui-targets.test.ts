import { z } from '@kvman/sdk';
import { describe, expect, it } from 'vitest';
import { errorsOf, recordedIssues } from './harness.ts';

const handle = async (): Promise<null> => null;
const reason = 'Needed.';

describe('UI view targets (plan 08 §8.7, ADR 0157)', () => {
  it('M2.10-E9 a view targets only what its author may put before the person', () => {
    expect(errorsOf(recordedIssues((ext) => {
      ext.registerCommand('pdf.secret', { description: 'Secret.', input: z.object({}), access: 'internal', handle });
      ext.registerQuery('pdf.private', {
        description: 'Private.', input: z.object({}), output: z.object({}), access: 'extensions', handle: async () => ({}),
      });
      ext.registerPage('pdf.home', {
        description: 'Home.', route: '/home', title: 'Home', queries: { secret: { query: 'pdf.private' } },
        view: {
          type: 'stack', children: [
            { type: 'button', label: 'Secret', onClick: { command: 'pdf.secret' } },
            { type: 'button', label: 'Kit', onClick: { command: 'kit.items.list' } },
            { type: 'button', label: 'Uninstall', onClick: { command: 'kernel.extension.uninstall' } },
            { type: 'button', label: 'Enable', onClick: { command: 'kernel.extension.enable' } },
            { type: 'form', command: 'pdf.secret' },
          ],
        },
      });
      ext.registerNavItem('pdf.nav', {
        description: 'Nav.', page: 'pdf.home', label: 'Home', icon: 'home', badge: { query: 'pdf.private', field: 'count' },
      });
    }))).toEqual([
      {
        path: 'ui.pages.0.view.children.0.onClick.command',
        message: 'pdf.secret has access "internal"; a view\'s sender is the person', hint: 'target a type with access "all" or "user"',
      },
      {
        path: 'ui.pages.0.view.children.1.onClick.command',
        message: 'kit.items.list is another extension\'s; its calls are not requested',
        hint: 'add ext.requestCapability(\'calls\', { types: [\'kit.items.list\'] })',
      },
      {
        path: 'ui.pages.0.view.children.2.onClick.command',
        message: 'kernel.extension.uninstall is for administrators', hint: 'request ext.requestCapability(\'kernel.admin\') to offer it',
      },
      {
        path: 'ui.pages.0.view.children.3.onClick.command',
        message: 'kernel.extension.enable grants power and is confirmed only in the grant dialog',
        hint: 'use { "openGrantDialog": { "command": "kernel.extension.enable", "payload": … } }',
      },
      {
        path: 'ui.pages.0.view.children.4.command',
        message: 'pdf.secret has access "internal"; a view\'s sender is the person', hint: 'target a type with access "all" or "user"',
      },
      {
        path: 'ui.pages.0.queries.secret.query',
        message: 'pdf.private has access "extensions"; a view\'s sender is the person', hint: 'target a type with access "all" or "user"',
      },
      {
        path: 'ui.navItems.0.badge.query',
        message: 'pdf.private has access "extensions"; a view\'s sender is the person', hint: 'target a type with access "all" or "user"',
      },
    ]);
    expect(errorsOf(recordedIssues((ext) => {
      ext.requestCapability('calls', { reason, types: ['kit.items.list'] });
      ext.requestCapability('kernel.admin', { reason });
      ext.registerCommand('pdf.save', { description: 'Saves.', input: z.object({}), handle });
      ext.registerQuery('pdf.open', {
        description: 'Open.', input: z.object({}), output: z.object({}), handle: async () => ({}),
      });
      ext.registerPage('pdf.home', {
        description: 'Home.', route: '/home', title: 'Home',
        queries: { open: { query: 'pdf.open' }, ws: { query: 'kernel.workspaces.list' }, kit: { query: 'kit.items.list' } },
        view: {
          type: 'stack', children: [
            { type: 'button', label: 'Uninstall', onClick: { command: 'kernel.extension.uninstall' } },
            { type: 'button', label: 'Enable', onClick: { openGrantDialog: { command: 'kernel.extension.enable', payload: {} } } },
            { type: 'form', command: 'pdf.save' },
          ],
        },
      });
    }))).toEqual([]);
  });
});
