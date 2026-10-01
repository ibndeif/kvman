import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach } from 'vitest';

// Extension projects for `kvman-check`, laid out as the kvdev scaffold lays them out (plan 09 §9.2): `src/index.ts` as
// `kvman.source`, and `locales/en.json` and `ar.json`. Each is written to a temporary folder removed after the test.

export type Project = { namespace?: string; source: string; locales?: Record<string, Record<string, string>> };

export const cleanCatalog = { 'notes.title': 'Notes', 'notes.pages.hello': 'Hello' };

export const cleanSource = `import { z, type Ctx } from '@kvman/sdk';

export default (ctx: Ctx): void => {
  ctx.registerQuery('notes.greeting.get', { description: 'Gives the greeting.', public: true, input: z.object({}), output: z.object({ text: z.string() }), handle: () => ({ text: 'Hello from notes!' }) });
  ctx.registerQuery('notes.ui.get', { description: 'Gives the pages of notes.', public: true, input: z.object({}), output: z.json(),
    handle: () => ({ pages: [{ id: 'hello', title: 'notes.pages.hello', view: { type: 'markdown', query: 'notes.greeting.get', input: {}, field: 'text' } }], nav: [{ id: 'hello', page: 'hello', title: 'notes.pages.hello', icon: 'puzzle', order: 50 }], panels: [], status: [] }) });
};
`;

export function useProjects(): (project: Project) => string {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });
  return (project) => {
    const folder = mkdtempSync(path.join(tmpdir(), 'kvman-check-'));
    roots.push(folder);
    const manifest = { name: 'notes', version: '0.1.0', type: 'module', main: 'dist/index.js', peerDependencies: { '@kvman/sdk': '^0.1.0' }, kvman: { namespace: project.namespace ?? 'notes', source: 'src/index.ts', dependencies: {} } };
    writeFileSync(path.join(folder, 'package.json'), JSON.stringify(manifest));
    mkdirSync(path.join(folder, 'src'));
    writeFileSync(path.join(folder, 'src', 'index.ts'), project.source);
    mkdirSync(path.join(folder, 'locales'));
    for (const [language, catalog] of Object.entries(project.locales ?? { en: cleanCatalog, ar: { 'notes.title': 'ملاحظات', 'notes.pages.hello': 'مرحبا' } })) {
      writeFileSync(path.join(folder, 'locales', `${language}.json`), JSON.stringify(catalog));
    }
    return folder;
  };
}
