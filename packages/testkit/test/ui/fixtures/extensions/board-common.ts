import { z, type ExtensionDefinition } from '@kvman/sdk';

export const boardCatalogs = {
  en: {
    meta: { title: 'Board' }, settings: { columns: 'Columns', intro: 'Configure your board.' },
    page: { home: 'Board home', card: 'Card' }, nav: { group: 'Boards', home: 'Home', top: 'Top' },
    toolbar: { find: 'Find', add: 'Add', menu: 'Menu', share: 'Share' },
    status: { count: '{count, plural, one {# card} other {# cards}}', sync: 'Synced' },
    panel: { tip: 'Tip', side: 'Side' }, action: { pin: 'Pin' }, chip: 'Chip',
  },
  ar: {
    meta: { title: 'لوحة' }, settings: { columns: 'أعمدة', intro: 'إعداد اللوحة' },
    page: { home: 'الرئيسية', card: 'بطاقة' }, nav: { group: 'لوحات', home: 'الرئيسية', top: 'أعلى' },
    toolbar: { find: 'بحث', add: 'إضافة', menu: 'قائمة', share: 'مشاركة' },
    status: { count: '{count, plural, zero {لا بطاقات} one {بطاقة} two {بطاقتان} few {# بطاقات} many {# بطاقة} other {# بطاقة}}', sync: 'تمت المزامنة' },
    panel: { tip: 'نصيحة', side: 'جانب' }, action: { pin: 'تثبيت' }, chip: 'بطاقة',
  },
};

export function registerBoard(ext: Parameters<ExtensionDefinition['setup']>[0], options: { share?: boolean; missingGroup?: boolean } = {}): void {
  ext.registerTranslations({ default: 'en', catalogs: boardCatalogs });
  ext.registerConfig({ scope: 'both', schema: z.object({ columns: z.number().describe('Number of columns.').meta({ label: '$t.settings.columns' }) }) });
  ext.registerSettingsSection({ description: 'Board settings.', view: { type: 'text', text: '$t.settings.intro' } });
  ext.registerComponent('board.chip', { description: 'A board chip.', props: z.object({ title: z.text() }), view: { type: 'text', text: '$props.title' } });
  ext.registerComponent('board.frame', { description: 'A board frame.', props: z.object({}), view: { type: 'board.chip', title: '$t.chip' } });
  ext.registerPage('board.home', { description: 'The board home.', route: '/board', title: '$t.page.home', view: { type: 'board.frame' } });
  ext.registerPage('board.card', { description: 'A board card.', route: '/board/:cardId', title: '$t.page.card', view: { type: 'text', text: '$t.page.card' } });
  ext.registerNavGroup('board.group', { description: 'Board navigation.', label: '$t.nav.group', order: 100 });
  ext.registerNavItem('board.nav-home', { description: 'Board home navigation.', page: 'board.home', group: options.missingGroup ? 'board.gone' : 'board.group', label: '$t.nav.home', icon: 'home', order: 200 });
  ext.registerNavItem('board.nav-top', { description: 'Top-level board navigation.', page: 'board.home', label: '$t.nav.top', icon: 'star', order: 300 });
  ext.registerToolbarItem('board.find', { description: 'Find boards.', slot: 'frame.topbar.end', as: 'button', label: '$t.toolbar.find', action: { navigate: '/board' }, order: 50 });
  ext.registerToolbarItem('board.add', { description: 'Add a card.', slot: 'frame.topbar.end', as: 'button', label: '$t.toolbar.add', action: { navigate: '/board' }, order: 100 });
  ext.registerToolbarItem('board.menu', { description: 'Board menu.', slot: 'frame.topbar.start', as: 'button', label: '$t.toolbar.menu', action: { navigate: '/board' } });
  if (options.share) ext.registerToolbarItem('board.share', { description: 'Share a board.', slot: 'frame.topbar.end', as: 'button', label: '$t.toolbar.share', action: { navigate: '/board' } });
  ext.registerStatusItem('board.count', { description: 'Card count.', side: 'start', label: { $t: 'status.count', count: 1 } });
  ext.registerStatusItem('board.sync', { description: 'Sync state.', label: '$t.status.sync' });
  ext.registerPanel('board.tip', { description: 'Board tip.', slot: 'frame.overlay', title: '$t.panel.tip', view: { type: 'board.chip', title: '$t.chip' } });
  ext.registerPanel('board.side', { description: 'Board side.', slot: 'kit.tray', title: '$t.panel.side', view: { type: 'text', text: '$t.panel.side' } });
  ext.registerAction('board.pin', { description: 'Pin a kit item.', entity: 'kit.item', label: '$t.action.pin', navigate: '/board' });
  ext.registerRenderer('board.row', { description: 'Render a kit entry.', target: 'kit.entry', view: { type: 'text', text: '$item.text' } });
  ext.registerRenderer('board.pdf', { description: 'Render a PDF.', target: 'mime:application/pdf', component: 'board.chip', props: { title: '$t.chip' } });
}
