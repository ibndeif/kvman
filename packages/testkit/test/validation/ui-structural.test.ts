import { z, type Ext } from '@kvman/sdk';
import { describe, expect, it } from 'vitest';
import { errorsOf, recordedIssues } from './harness.ts';

const handle = async (): Promise<null> => null;
const reason = 'Needed.';

type View = { type: string; [prop: string]: unknown };

function homePage(ext: Ext, view: View): void {
  ext.registerPage('pdf.home', { description: 'Home.', route: '/home', title: 'Home', view });
}

function translateCommand(ext: Ext): void {
  ext.registerCommand('pdf.translate', { description: 'Translates.', input: z.object({ fileId: z.string() }), handle });
}

function fileEntity(ext: Ext, route?: string): void {
  ext.registerEntity('pdf.file', {
    description: 'File.', title: 'File', schema: z.object({ id: z.string(), name: z.string() }),
    display: { title: '$item.name' }, ...(route === undefined ? {} : { route }),
  });
}

describe('UI structural validation (plan 06 §6.3, ADRs 0156–0157)', () => {
  it('M2.10-H1 a panel in the sidebar fails naming what the slot accepts', () => {
    expect(errorsOf(recordedIssues((ext) => {
      ext.registerPanel('pdf.tip', { description: 'Tip.', slot: 'frame.sidebar', view: { type: 'stack' } });
    }))).toEqual([{
      path: 'ui.panels.0.slot', message: 'frame.sidebar does not accept a panel',
      hint: 'frame.sidebar accepts navGroup, navItem, separator; a panel goes in frame.overlay, or an extension slot that accepts panel',
    }]);
    expect(errorsOf(recordedIssues((ext) => {
      ext.registerPanel('pdf.tip', { description: 'Tip.', slot: 'frame.overlay', view: { type: 'stack' } });
    }))).toEqual([]);
  });
  it('M2.10-H2 an unregistered component, or a foreign one not required, fails at the node type', () => {
    const page = (type: string) => (ext: Ext): void => homePage(ext, { type });
    expect(errorsOf(recordedIssues(page('pdf.missingCard')))).toEqual([{
      path: 'ui.pages.0.view.type', message: 'no component pdf.missingCard is registered',
      hint: 'register it with ext.registerComponent(\'pdf.missingCard\', …), or use a built-in component',
    }]);
    expect(errorsOf(recordedIssues(page('kit.card')))).toEqual([{
      path: 'ui.pages.0.view.type', message: 'kit.card is another extension\'s component and is not required',
      hint: 'add ext.requireComponents([\'kit.card\'], { reason })',
    }]);
    expect(errorsOf(recordedIssues((ext) => {
      ext.requireComponents(['kit.card'], { reason });
      ext.registerComponent('pdf.missingCard', { description: 'Card.', props: z.object({}), view: { type: 'stack' } });
      homePage(ext, { type: 'stack', children: [{ type: 'pdf.missingCard' }, { type: 'kit.card' }] });
    }))).toEqual([]);
  });
  it('M2.10-H3 a public composite writing its own command fails at the action', () => {
    expect(errorsOf(recordedIssues((ext) => {
      translateCommand(ext);
      ext.registerComponent('pdf.card', {
        description: 'Card.', visibility: 'public', props: z.object({}),
        view: { type: 'stack', children: [{ type: 'button', label: 'Go', onClick: { command: 'pdf.translate' } }] },
      });
    }))).toEqual([{
      path: 'ui.components.0.view.children.0.onClick',
      message: 'a public component cannot write an action of its own other than navigate or openDialog',
      hint: 'take the action as a z.action() prop and bind it with "$props.<name>"',
    }]);
  });
  it('M2.10-E4 a toolbar item in a panel slot, and a panel in no slot, fail', () => {
    expect(errorsOf(recordedIssues((ext) => {
      ext.registerSlot('pdf.tray', { description: 'Tray.', accepts: ['panel'] });
      ext.registerToolbarItem('pdf.upload', {
        description: 'Upload.', slot: 'pdf.tray', as: 'button', label: 'Upload', action: { navigate: '/home' },
      });
      ext.registerPanel('pdf.tip', { description: 'Tip.', slot: 'pdf.nowhere', view: { type: 'stack' } });
    }))).toEqual([
      {
        path: 'ui.toolbarItems.0.slot', message: 'pdf.tray does not accept a toolbarItem',
        hint: 'pdf.tray accepts panel; a toolbarItem goes in frame.topbar.start or frame.topbar.end, or an extension slot that accepts toolbarItem',
      },
      {
        path: 'ui.panels.0.slot', message: 'pdf.nowhere is not a slot of @acme/pdf',
        hint: 'register it with ext.registerSlot(\'pdf.nowhere\', …)',
      },
    ]);
    expect(errorsOf(recordedIssues((ext) => {
      ext.registerStatusItem('pdf.queue', { description: 'Queue.', label: 'Queue' });
      ext.registerPanel('pdf.tip', { description: 'Tip.', slot: 'kit.tray', view: { type: 'stack' } });
    }))).toEqual([]);
  });
  it('M2.10-E5 only a slot’s owner places it', () => {
    expect(errorsOf(recordedIssues((ext) => {
      homePage(ext, { type: 'stack', children: [{ type: 'slot', name: 'kit.tray' }, { type: 'slot', name: 'pdf.nowhere' }] });
    }))).toEqual([
      {
        path: 'ui.pages.0.view.children.0.name', message: 'kit.tray is not a slot of @acme/pdf; only a slot\'s owner places it',
        hint: 'place one of your own slots, registered with ext.registerSlot',
      },
      {
        path: 'ui.pages.0.view.children.1.name', message: 'pdf.nowhere is not a slot of @acme/pdf; only a slot\'s owner places it',
        hint: 'place one of your own slots, registered with ext.registerSlot',
      },
    ]);
    expect(errorsOf(recordedIssues((ext) => {
      ext.registerSlot('pdf.tray', { description: 'Tray.', accepts: ['panel'] });
      homePage(ext, { type: 'stack', children: [{ type: 'slot', name: 'pdf.tray' }] });
    }))).toEqual([]);
  });
  it('M2.10-E6 a nav item opens one of its own pages; its group may be foreign', () => {
    expect(errorsOf(recordedIssues((ext) => {
      ext.registerNavItem('pdf.nav', { description: 'Nav.', page: 'kit.home', label: 'Home', icon: 'home' });
    }))).toEqual([{
      path: 'ui.navItems.0.page', message: 'kit.home is not a page of @acme/pdf', hint: 'a nav item opens one of its own pages',
    }]);
    expect(errorsOf(recordedIssues((ext) => {
      homePage(ext, { type: 'stack' });
      ext.registerNavItem('pdf.nav', { description: 'Nav.', page: 'pdf.home', group: 'kit.documents', label: 'Home', icon: 'home' });
    }))).toEqual([]);
  });
  it('M2.10-E7 only an openDialog holding a command fails the public-component rule', () => {
    const button = (onClick: unknown): View => ({ type: 'button', label: 'Go', onClick });
    expect(errorsOf(recordedIssues((ext) => {
      ext.registerCommand('pdf.run', { description: 'Runs.', input: z.object({}), handle });
      const composite = (id: string, view: View, props: z.ZodType = z.object({}), visibility: 'public' | 'private' = 'private'): void => {
        ext.registerComponent(id, { description: `${id}.`, visibility, props, view });
      };
      composite('pdf.navigate', button({ navigate: '/home' }), z.object({}), 'public');
      composite('pdf.plainDialog', button({ openDialog: { title: 'Pick', view: { type: 'text', text: 'Hi' } } }), z.object({}), 'public');
      composite('pdf.commandDialog', button({ openDialog: { title: 'Run', view: button({ command: 'pdf.run' }) } }), z.object({}), 'public');
      composite('pdf.delegated', button('$props.onAction'), z.object({ onAction: z.action() }), 'public');
      composite('pdf.own', button({ command: 'pdf.run' }));
    }))).toEqual([{
      path: 'ui.components.2.view.onClick.openDialog.view.onClick',
      message: 'a public component cannot write an action of its own other than navigate or openDialog',
      hint: 'take the action as a z.action() prop and bind it with "$props.<name>"',
    }]);
  });
  it('M2.10-E8 a composite reaching itself, or nesting past 8 levels, fails', () => {
    expect(errorsOf(recordedIssues((ext) => {
      ext.registerComponent('pdf.a', { description: 'A.', props: z.object({}), view: { type: 'pdf.a' } });
    }))).toEqual([{
      path: 'ui.components.0', message: 'pdf.a uses itself',
      hint: 'a composite cannot contain itself, directly or through other components',
    }]);
    expect(errorsOf(recordedIssues((ext) => {
      ext.registerComponent('pdf.a', { description: 'A.', props: z.object({}), view: { type: 'pdf.b' } });
      ext.registerComponent('pdf.b', { description: 'B.', props: z.object({}), view: { type: 'pdf.a' } });
    }))).toEqual([{
      path: 'ui.components.0', message: 'the composites form a cycle: pdf.a → pdf.b → pdf.a',
      hint: 'a composite cannot contain itself, directly or through other components',
    }]);
    expect(errorsOf(recordedIssues((ext) => {
      for (let level = 1; level <= 9; level += 1) {
        ext.registerComponent(`pdf.c${level}`, {
          description: `Level ${level}.`, props: z.object({}),
          view: level === 9 ? { type: 'stack' } : { type: `pdf.c${level + 1}` },
        });
      }
    }))).toEqual([{
      path: 'ui.components.0', message: 'pdf.c1 nests 9 composite levels; at most 8 are allowed', hint: 'flatten the composites',
    }]);
  });
  it('M2.10-E10 reserved params, palette $item, live refreshOn, and deep dialogs fail', () => {
    expect(errorsOf(recordedIssues((ext) => {
      ext.registerEvent('pdf.progress.updated', { description: 'Progress.', delivery: 'live', chunk: 'text' });
      ext.registerQuery('pdf.files.list', {
        description: 'Lists.', input: z.object({}), output: z.object({ items: z.array(z.object({ id: z.string() })) }),
        handle: async () => ({ items: [] }),
      });
      fileEntity(ext);
      ext.registerPage('pdf.home', {
        description: 'Home.', route: '/home', title: 'Home', params: { ws: 'string', side: 'string', embed: 'boolean' },
        queries: { files: { query: 'pdf.files.list', refreshOn: ['pdf.progress.updated'] } }, view: { type: 'stack' },
      });
      ext.registerAction('pdf.inspect', {
        description: 'Inspect.', entity: 'pdf.file', label: '$item.name', placement: ['palette'], navigate: '/files',
      });
    }))).toEqual([
      { path: 'ui.pages.0.params.ws', message: '"ws" is a search parameter of the shell', hint: 'rename the parameter' },
      { path: 'ui.pages.0.params.side', message: '"side" is a search parameter of the shell', hint: 'rename the parameter' },
      { path: 'ui.pages.0.params.embed', message: '"embed" is a search parameter of the shell', hint: 'rename the parameter' },
      {
        path: 'ui.pages.0.queries.files.refreshOn.0',
        message: 'pdf.progress.updated is a live event; refreshOn names durable or transient events',
        hint: 'show a live event with a live prop instead',
      },
      {
        path: 'ui.actions.0.label', message: 'a palette action has no record to read $item from',
        hint: 'drop "palette" from placement, or stop reading $item',
      },
    ]);
    expect(errorsOf(recordedIssues((ext) => {
      ext.registerComponent('pdf.wrap', {
        description: 'Wrap.', props: z.object({}),
        view: { type: 'button', label: 'Open', onClick: { openDialog: { title: 'One', view: { type: 'button', label: 'Deeper', onClick: { openDialog: { title: 'Two', view: { type: 'text', text: 'Deep' } } } } } } },
      });
      homePage(ext, { type: 'button', label: 'Open', onClick: { openDialog: { title: 'Top', view: { type: 'pdf.wrap' } } } });
    }))).toEqual([{
      path: 'ui.pages.0.view.onClick.openDialog.view',
      message: 'dialogs nest 3 deep here; at most 2 are allowed', hint: 'open the deeper view as a page instead',
    }]);
    expect(errorsOf(recordedIssues((ext) => {
      homePage(ext, { type: 'button', label: 'Open', onClick: { openDialog: { title: 'One', view: { type: 'button', label: 'Deeper', onClick: { openDialog: { title: 'Two', view: { type: 'text', text: 'Deep' } } } } } } });
    }))).toEqual([]);
  });
  it('M2.10-E11 an entity route opens one of its own pages with its $item fields', () => {
    expect(errorsOf(recordedIssues((ext) => {
      ext.registerPage('pdf.files', { description: 'Files.', route: '/files/:fileId', title: 'Files', view: { type: 'stack' } });
      fileEntity(ext, '/files/{{ $item.id }}');
      ext.registerEntity('pdf.doc', {
        description: 'Doc.', title: 'Doc', schema: z.object({ id: z.string() }),
        display: { title: '$item.id' }, route: '/docs/{{ $item.id }}',
      });
      ext.registerEntity('pdf.broken', {
        description: 'Broken.', title: 'Broken', schema: z.object({ id: z.string() }),
        display: { title: '$item.id' }, route: '/files/{{ $item.nope }}',
      });
    }))).toEqual([
      {
        path: 'entities.1.route', message: 'no page of @acme/pdf has the route /docs/{{ $item.id }}',
        hint: 'use the route of one of its pages, with {{ $item.<field> }} for each :param',
      },
      { path: 'entities.2.route', message: '$item.nope does not exist in the entity\'s schema' },
    ]);
  });
  it('M2.10-E12 a page node sets entity and record together; settingsSections needs kernel.admin', () => {
    expect(errorsOf(recordedIssues((ext) => {
      ext.registerConfig({ scope: 'global', schema: z.object({ name: z.string().describe('Name.') }) });
      homePage(ext, { type: 'page', entity: 'pdf.file', title: 'File' });
      ext.registerSettingsSection({ description: 'Settings.', view: { type: 'settingsSections' } });
    }))).toEqual([
      { path: 'ui.pages.0.view', message: 'a page node sets entity and record together', hint: 'set both, or neither' },
      {
        path: 'ui.settingsSection.view.type', message: 'only an extension holding kernel.admin shows settings sections',
        hint: 'link to /settings instead',
      },
    ]);
    expect(errorsOf(recordedIssues((ext) => {
      ext.registerConfig({ scope: 'global', schema: z.object({ name: z.string().describe('Name.') }) });
      ext.requestCapability('kernel.admin', { reason });
      homePage(ext, { type: 'page', title: 'File' });
      ext.registerSettingsSection({ description: 'Settings.', view: { type: 'settingsSections' } });
    }))).toEqual([]);
  });
  it('M2.10-E13 route forms fail, and two params on one route clash', () => {
    expect(errorsOf(recordedIssues((ext) => {
      for (const [index, route] of ['/Files', '/_kvman/x', '/api/x', '/files/:a', '/files/:b'].entries()) {
        ext.registerPage(`pdf.p${index}`, { description: `Page ${index}.`, route, title: `Page ${index}.`, view: { type: 'stack' } });
      }
    }))).toEqual([
      { path: 'ui.pages.0.route', message: '"Files" is not a route segment', hint: 'use lowercase words joined by "-", or a ":param"' },
      {
        path: 'ui.pages.1.route', message: 'routes under /_kvman belong to kvman',
        hint: 'choose a route that does not start with /_kvman or /api',
      },
      {
        path: 'ui.pages.2.route', message: 'routes under /api belong to kvman',
        hint: 'choose a route that does not start with /_kvman or /api',
      },
      {
        path: 'ui.pages.4.route', message: 'pdf.p3 (/files/:a) and pdf.p4 (/files/:b) open on the same route',
        hint: 'change one of the routes',
      },
    ]);
  });
});
