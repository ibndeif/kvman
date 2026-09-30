import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// A real kvman for Chromium (plan 12 §12.1): the CLI from its source, a temporary home and user folder, kvwebui
// bundled, and the `notes` fixture extension by `path:`. Everything is stopped and removed by `close`.

const mainFile = fileURLToPath(new URL('../../../../../packages/cli/src/main.ts', import.meta.url));

export type RunningKvman = { url: string; origin: string; close(): Promise<void> };

const notesEntry = `import { z, type Ctx } from '@kvman/sdk';

export default (ctx: Ctx): void => {
  const view = {
    type: 'stack', direction: 'vertical', children: [
      { type: 'heading', text: 'notes.pages.list', level: 1 },
      { type: 'link', text: 'notes.open', to: { page: 'notes.note', params: { noteId: 'n2' } } },
    ],
  };
  const ui = {
    pages: [
      { id: 'list', title: 'notes.pages.list', view },
      { id: 'note', title: 'notes.pages.note', params: ['noteId'], view: { type: 'text', text: 'notes.showing', params: { id: { $param: 'noteId' } } } },
    ],
    nav: [{ id: 'list', page: 'list', title: 'notes.pages.list', icon: 'notebook', order: 1 }],
    panels: [{ id: 'help', title: 'notes.help', icon: 'circle-question-mark', view: { type: 'text', text: 'notes.help' } }],
    status: [],
  };
  ctx.registerQuery('notes.ui.get', { description: 'Gives the notes pages.', input: z.object({}), output: z.unknown(), public: true, handle: () => ui });
};
`;

const catalogs = {
  en: { 'notes.pages.list': 'Notes', 'notes.pages.note': 'Note', 'notes.open': 'Open note n2', 'notes.showing': 'Showing note {id}', 'notes.help': 'Help' },
  ar: { 'notes.pages.list': 'الملاحظات', 'notes.pages.note': 'ملاحظة', 'notes.open': 'افتح الملاحظة n2', 'notes.showing': 'عرض الملاحظة {id}', 'notes.help': 'مساعدة' },
};

function writeFixture(root: string, language: string): string {
  const notes = path.join(root, 'notes');
  mkdirSync(path.join(notes, 'locales'), { recursive: true });
  const manifest = { name: '@test/notes', version: '0.1.0', type: 'module', main: 'index.js', peerDependencies: { '@kvman/sdk': '^0.1.0' }, kvman: { namespace: 'notes', source: 'index.ts' } };
  writeFileSync(path.join(notes, 'package.json'), JSON.stringify(manifest));
  writeFileSync(path.join(notes, 'index.ts'), notesEntry);
  for (const [name, catalog] of Object.entries(catalogs)) writeFileSync(path.join(notes, 'locales', `${name}.json`), JSON.stringify(catalog));
  const preset = { name: 'e2e', extensions: { '@kvman/kvwebui': 'bundled', '@test/notes': 'path:./notes' }, settings: { 'kvwebui.home': 'notes.list', 'kernel.language': language } };
  const presetFile = path.join(root, 'e2e.json');
  writeFileSync(presetFile, JSON.stringify(preset));
  return presetFile;
}

function waitForUrl(child: ChildProcess, output: () => string): Promise<string> {
  return new Promise((resolve, reject) => {
    const check = (): void => {
      const match = /http:\/\/127\.0\.0\.1:\d+\/\?workspace=\S+/.exec(output());
      if (match !== null) resolve(match[0]);
    };
    child.stdout?.on('data', check);
    child.once('exit', (code) => reject(new Error(`kvman exited (${String(code)}) before printing its URL:\n${output()}`)));
  });
}

export async function startKvman(language: string): Promise<RunningKvman> {
  const root = mkdtempSync(path.join(tmpdir(), 'kvwebui-e2e-'));
  const [home, user, start] = ['home', 'user', 'project'].map((name) => path.join(root, name));
  for (const folder of [user ?? '', start ?? '']) mkdirSync(folder, { recursive: true });
  const presetFile = writeFixture(root, language);
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: user, USERPROFILE: user };
  delete env['KVMAN_HOME'];
  const child = spawn(process.execPath, ['--conditions=@kvman/source', mainFile, '--home', home ?? '', '--port', '0', '--no-open', '--yes', '--preset', presetFile], { cwd: start, env, stdio: 'pipe' });
  let output = '';
  child.stdout.setEncoding('utf8').on('data', (text: string) => (output += text));
  child.stderr.setEncoding('utf8').on('data', (text: string) => (output += text));
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
  const close = async (): Promise<void> => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    await exited;
    rmSync(root, { recursive: true, force: true });
  };
  const url = await waitForUrl(child, () => output).catch(async (error: unknown) => {
    await close();
    throw error;
  });
  return { url, origin: new URL(url).origin, close };
}
