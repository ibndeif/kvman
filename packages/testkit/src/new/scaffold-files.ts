import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { scaffoldVersions } from './scaffold-versions.ts';

// The files `kvman-new` writes (plan 09 §9.2, ADR 0010, 9, 17, 18), by path within the project. Source files come
// from the testkit's `templates/`, with `__NAMESPACE__` and `__NAME__` filled in; package.json, tsconfig, and the
// catalogs are built as JSON; the platform guides are the testkit's `docs/`, byte for byte.

export type ScaffoldInput = { name: string; namespace: string; web: boolean };

const templates = fileURLToPath(new URL('../../templates/', import.meta.url));
const guides = fileURLToPath(new URL('../../docs/', import.meta.url));

function template(file: string, input: ScaffoldInput, extra: Record<string, string> = {}): string {
  let text = readFileSync(`${templates}${file}.template`, 'utf8').replaceAll('__NAMESPACE__', input.namespace).replaceAll('__NAME__', input.name);
  for (const [placeholder, value] of Object.entries(extra)) text = text.replaceAll(placeholder, value);
  return text;
}

function guide(file: string): string {
  return readFileSync(`${guides}${file}`, 'utf8');
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function packageJson(input: ScaffoldInput): unknown {
  const web = input.web
    ? { scripts: { 'web:build': 'node web-build.ts', 'web:watch': 'node web-build.ts --watch' }, devDependencies: { '@vitejs/plugin-vue': scaffoldVersions.pluginVue, vite: scaffoldVersions.vite, vue: scaffoldVersions.vue } }
    : { scripts: {}, devDependencies: {} };
  return {
    name: input.name,
    version: '0.1.0',
    description: `The ${input.namespace} kvman extension.`,
    type: 'module',
    main: 'dist/index.js',
    files: ['dist', 'locales', 'extension-docs'],
    scripts: { build: input.web ? 'tsc -p tsconfig.build.json && npm run web:build' : 'tsc -p tsconfig.build.json', check: 'kvman-check', test: 'node --test "test/**/*.test.ts"', ...web.scripts },
    peerDependencies: { '@kvman/sdk': '^0.1.0' },
    devDependencies: {
      '@kvman/sdk': scaffoldVersions.sdk,
      '@kvman/testkit': scaffoldVersions.testkit,
      '@types/node': scaffoldVersions.typesNode,
      typescript: scaffoldVersions.typescript,
      ...web.devDependencies,
    },
    kvman: { namespace: input.namespace, source: 'src/index.ts', dependencies: {}, ...(input.web ? { web: 'dist/web' } : {}) },
  };
}

const compilerOptions = {
  target: 'es2024',
  lib: ['es2024'],
  module: 'nodenext',
  moduleResolution: 'nodenext',
  types: ['node'],
  strict: true,
  verbatimModuleSyntax: true,
  erasableSyntaxOnly: true,
  allowImportingTsExtensions: true,
  rewriteRelativeImportExtensions: true,
  skipLibCheck: true,
  noEmit: true,
};

function catalogs(input: ScaffoldInput): { en: Record<string, string>; ar: Record<string, string> } {
  const key = (suffix: string): string => `${input.namespace}.${suffix}`;
  const en: Record<string, string> = { [key('title')]: input.namespace, [key('pages.hello')]: 'Hello' };
  const ar: Record<string, string> = { [key('title')]: input.namespace, [key('pages.hello')]: 'مرحبا' };
  if (input.web) {
    Object.assign(en, { [key('hello.text')]: 'Hello from a Vue component!', [key('hello.count')]: 'Count: {count}' });
    Object.assign(ar, { [key('hello.text')]: 'مرحبا من مكوّن Vue!', [key('hello.count')]: 'العدد: {count}' });
  }
  return { en, ar };
}

function pageView(input: ScaffoldInput): string {
  const greeting = `{ type: 'markdown', query: '${input.namespace}.greeting.get', input: {}, field: 'text' }`;
  if (!input.web) return greeting;
  return `{ type: 'stack', direction: 'vertical', gap: 'md', children: [${greeting}, { type: 'custom', component: '${input.namespace}.hello', props: {} }] }`;
}

const webReadme = `- \`web/components/*.vue\` are custom components: \`npm run web:build\` builds each into \`dist/web/components/<name>.js\` and \`.css\`, and \`npm run web:watch\` rebuilds them on change; a page refresh shows them.
`;

const webAgents = `- \`web/components/*.vue\` are custom components: \`npm run web:build\` builds each into \`dist/web\`, and a page refresh shows them.
`;

export function scaffoldFiles(input: ScaffoldInput): Record<string, string> {
  const { en, ar } = catalogs(input);
  const files: Record<string, string> = {
    'package.json': json(packageJson(input)),
    'tsconfig.json': json({ compilerOptions, include: ['src', 'test', '*.ts'] }),
    'tsconfig.build.json': json({ extends: './tsconfig.json', compilerOptions: { noEmit: false, rootDir: 'src', outDir: 'dist', declaration: true }, include: ['src'] }),
    'src/index.ts': template('src/index.ts', input, { __PAGE_VIEW__: pageView(input) }),
    'src/docs.ts': template('src/docs.ts', input),
    'test/extension.test.ts': template('test/extension.test.ts', input),
    'locales/en.json': json(en),
    'locales/ar.json': json(ar),
    'README.md': template('README.md', input, { __WEB_README__: input.web ? webReadme : '' }),
    'AGENTS.md': template('AGENTS.md', input, { __WEB_AGENTS__: input.web ? webAgents : '' }),
    'CLAUDE.md': '@AGENTS.md\n',
    'docs/conventions.md': guide('conventions.md'),
    'docs/sdk.md': guide('sdk.md'),
    'docs/i18n.md': guide('i18n.md'),
    'docs/presets.md': guide('presets.md'),
    'extension-docs/usage.md': template('extension-docs/usage.md', input),
  };
  if (input.web) {
    files['web/components/Hello.vue'] = template('web/components/Hello.vue', input);
    files['web-build.ts'] = template('web-build.ts', input);
  }
  return files;
}
