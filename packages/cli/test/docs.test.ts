import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The documentation (QA17-H22 to H24, E24): the pages exist and have content, every relative link and anchor resolves,
// the references name every kernel command, error code, and flag, and no page promises what isn't built.

const root = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');
const developers = path.join(root, 'docs', 'developers');
const userGuide = path.join(root, 'docs', 'user-guide');

const developerPages = [
  'README', 'getting-started', 'anatomy', 'sdk', 'jobs', 'storage', 'views', 'components', 'localization', 'connectors', 'agents-and-tools', 'documenting-your-extension', 'presets',
  'testing', 'preview-and-hot-reload', 'kernel-api', 'http-api', 'errors', 'publishing', 'architecture', 'contributing',
];
const userPages = [
  'README', 'installing', 'first-run', 'web-app', 'workspaces', 'models-and-providers', 'coding-app', 'extensions', 'presets', 'settings-and-secrets',
  'customizing-with-the-agent', 'building-extensions', 'troubleshooting', 'privacy-and-security',
];

const read = (file: string): string => readFileSync(file, 'utf8');
const planFile = (name: string): string => read(path.join(root, 'plan', name));

function markdownFiles(folder: string): string[] {
  return readdirSync(folder).filter((name) => name.endsWith('.md')).map((name) => path.join(folder, name));
}

// GitHub's heading slug: lower case, spaces to hyphens, everything but letters, digits, hyphens, and underscores dropped.
function slug(heading: string): string {
  return heading.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');
}

function headingsOf(markdown: string): Set<string> {
  const withoutFences = markdown.replace(/```[\s\S]*?```/g, '');
  return new Set([...withoutFences.matchAll(/^#{1,6}\s+(.+)$/gm)].map((match) => slug(match[1] ?? '')));
}

function linksOf(markdown: string): string[] {
  const withoutFences = markdown.replace(/```[\s\S]*?```/g, '');
  return [...withoutFences.matchAll(/\]\(([^)\s]+)\)/g)].map((match) => match[1] ?? '').filter((target) => !/^(https?:|mailto:)/.test(target));
}

// The members of the testkit's test kernel object, which the testing page writes as `kernel.<member>`.
const testKernelMembers = new Set(['home', 'homeFolder', 'clock', 'exec', 'execAsync', 'waitForJob', 'watch', 'cancel', 'restart', 'close']);

const allPages = [...markdownFiles(developers), ...markdownFiles(userGuide)];

describe('the documentation (QA17-H22 to H24, E24)', () => {
  it('QA17-H22 the developer documentation has the index and every page, each with a title, a who-is-it-for line, and a Next list', () => {
    for (const page of developerPages) {
      const file = path.join(developers, `${page}.md`);
      expect(existsSync(file), page).toBe(true);
      const markdown = read(file);
      expect(markdown.length, page).toBeGreaterThan(500);
      expect(markdown.startsWith('# '), page).toBe(true);
      expect(markdown, page).toMatch(/\n## Next\n/);
      expect(markdown.split('\n').length, page).toBeLessThanOrEqual(300);
    }
    expect(markdownFiles(developers).map((file) => path.basename(file, '.md')).sort()).toEqual([...developerPages].sort());
  });

  it('QA17-H23 the user guide has the index and every page, each with a title and a Next list', () => {
    for (const page of userPages) {
      const file = path.join(userGuide, `${page}.md`);
      expect(existsSync(file), page).toBe(true);
      const markdown = read(file);
      expect(markdown.length, page).toBeGreaterThan(500);
      expect(markdown.startsWith('# '), page).toBe(true);
      expect(markdown, page).toMatch(/\n## Next\n/);
      expect(markdown.split('\n').length, page).toBeLessThanOrEqual(300);
    }
    expect(markdownFiles(userGuide).map((file) => path.basename(file, '.md')).sort()).toEqual([...userPages].sort());
  });

  it('QA17-H24 every relative link and anchor in the documentation, the README, and the scaffold resolves', () => {
    const files = [...allPages, path.join(root, 'README.md'), path.join(root, 'packages', 'testkit', 'templates', 'AGENTS.md.template')];
    for (const file of files) {
      const markdown = read(file);
      for (const link of linksOf(markdown)) {
        const [target = '', anchor] = link.split('#');
        const resolved = target === '' ? file : path.resolve(path.dirname(file), target);
        expect(existsSync(resolved), `${path.relative(root, file)} links to ${link}`).toBe(true);
        if (anchor !== undefined && anchor !== '' && statSync(resolved).isFile() && resolved.endsWith('.md')) {
          expect(headingsOf(read(resolved)).has(anchor), `${path.relative(root, file)} links to ${link}`).toBe(true);
        }
      }
    }
  });

  it('QA17-H24 kernel-api.md names every kernel command and query, errors.md every error code, and installing.md every flag', () => {
    const kernelPlan = planFile('02-kernel.md');
    const table = kernelPlan.slice(kernelPlan.indexOf('## 2.12'), kernelPlan.indexOf('## 2.13'));
    const kernelNames = [...table.matchAll(/^\| `(kernel\.[a-z.]+)` \|/gm)].map((match) => match[1] ?? '');
    expect(kernelNames.length).toBeGreaterThan(20);
    const kernelApi = read(path.join(developers, 'kernel-api.md'));
    for (const name of kernelNames) expect(kernelApi, name).toContain(`\`${name}\``);

    const codes = [...planFile('05-errors.md').matchAll(/^\| `([A-Z_]+)` \|/gm)].map((match) => match[1] ?? '');
    expect(codes.length).toBe(18);
    const errors = read(path.join(developers, 'errors.md'));
    for (const code of codes) expect(errors, code).toContain(`\`${code}\``);

    const usage = planFile('01-overview.md').split('\n').find((line) => line.startsWith('kvman [--mode web]')) ?? '';
    const flags = [...new Set([...usage.matchAll(/--[a-z-]+/g)].map((match) => match[0]).concat(['--help', '--version']))];
    expect(flags).toEqual(expect.arrayContaining(['--mode', '--preset', '--home', '--port', '--yes', '--no-open', '--log-level', '--help', '--version']));
    const installing = read(path.join(userGuide, 'installing.md'));
    for (const flag of flags) expect(installing, flag).toContain(`\`${flag}`);
  });

  it('QA17-E24 no page names the old extension or a dev preset outside the two migration notes', () => {
    const allowed = [path.join(developers, 'publishing.md'), path.join(userGuide, 'troubleshooting.md')];
    const oldName = new RegExp('kv' + 'dev', 'i');
    for (const file of allPages) {
      if (allowed.includes(file)) continue;
      const markdown = read(file);
      expect(markdown, path.relative(root, file)).not.toMatch(oldName);
      expect(markdown, path.relative(root, file)).not.toMatch(/\bdev[ -]preset\b/i);
    }
    for (const file of allowed) expect(read(file), path.relative(root, file)).toMatch(/Migrating from kv/);
  });

  it('QA17-E24 no page names a kernel name, a tool, or a kvcustomizer name that is not in the plan or the code', () => {
    const kernelPlan = planFile('02-kernel.md');
    const known = new Set([
      ...[...kernelPlan.slice(kernelPlan.indexOf('## 2.12'), kernelPlan.indexOf('## 2.13')).matchAll(/`(kernel\.[a-z.]+)`/g)].map((match) => match[1] ?? ''),
      ...[...kernelPlan.slice(kernelPlan.indexOf('## 2.15'), kernelPlan.indexOf('## 2.16')).matchAll(/`(kernel\.[a-z.]+)`/g)].map((match) => match[1] ?? ''),
      'kernel.port', 'kernel.workers', 'kernel.workerConcurrency', 'kernel.language', 'kernel.jobs.retentionDays', 'kernel.web.home', 'kernel.title',
    ]);
    const bins = Object.keys((JSON.parse(read(path.join(root, 'packages', 'testkit', 'package.json'))) as { bin: Record<string, string> }).bin);
    const registered = new Set<string>();
    const source = (folder: string): void => {
      for (const entry of readdirSync(folder, { withFileTypes: true })) {
        const absolute = path.join(folder, entry.name);
        if (entry.isDirectory()) source(absolute);
        else if (entry.name.endsWith('.ts')) for (const match of read(absolute).matchAll(/register(?:Command|Query)\(\s*'(kvcustomizer\.[a-z.-]+)'/g)) registered.add(match[1] ?? '');
      }
    };
    source(path.join(root, 'extensions', 'kvcustomizer', 'src'));
    for (const file of allPages) {
      const markdown = read(file);
      const where = path.relative(root, file);
      for (const match of markdown.matchAll(/`(kernel\.[a-zA-Z.]+)`/g)) {
        const name = match[1] ?? '';
        if (name.startsWith('kernel.errors.') || name.endsWith('.') || testKernelMembers.has(name.split('.')[1] ?? '')) continue;
        expect(known.has(name), `${where} names ${name}`).toBe(true);
      }
      for (const match of markdown.matchAll(/(?<![./\w-])kvman-[a-z]+\b/g)) expect(bins, `${where} names ${match[0]}`).toContain(match[0]);
      for (const match of markdown.matchAll(/`(kvcustomizer\.[a-z.-]+)`/g)) {
        const name = match[1] ?? '';
        if (name.endsWith('.')) continue;
        expect(registered.has(name), `${where} names ${name}`).toBe(true);
      }
    }
  });
});
