import { workspaceA } from '../hosts/harness.ts';
import type { UiFixture } from './harness.ts';
import { patch } from './registry-harness.ts';

export const helpCatalogs = {
  en: { help: { title: 'Help', body: 'Help body', extras: 'Extras', nav: 'Help', card: 'Help card' }, labels: { home: 'Board home' } },
  ar: { help: { title: 'مساعدة', body: 'نص المساعدة', extras: 'إضافات', nav: 'مساعدة', card: 'بطاقة مساعدة' }, labels: { home: 'الرئيسية' } },
};

export async function helpPreset(fixture: UiFixture): Promise<void> {
  await patch(fixture, workspaceA, {
    pages: [{ name: 'help', description: 'Help page.', route: '/help', title: '$t.help.title', view: { type: 'text', text: '$t.help.body' } }],
    navGroups: [{ name: 'extras', description: 'Extra pages.', label: '$t.help.extras', order: 900 }],
    nav: [{ name: 'nav-help', description: 'Help navigation.', page: 'preset.help', label: '$t.help.nav', icon: 'circle-help' }],
    translations: { default: 'en', catalogs: helpCatalogs },
  });
}
