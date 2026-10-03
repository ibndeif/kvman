import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Fixture extensions that serve docs, written as folders with a package.json and an index.js. Each returns a preset
// `extensions` entry of `"<name>": "path:<absolute folder>"`.

const okEntry = `import { ProblemError, z } from '@kvman/sdk';

const listing = z.array(z.strictObject({ topic: z.string(), title: z.string() }));
const page = z.strictObject({ topic: z.string(), title: z.string(), markdown: z.string() });

export default (ctx) => {
  ctx.registerQuery('okdocs.docs.list', {
    description: 'Lists the ok guides.',
    public: true,
    input: z.object({}),
    output: listing,
    handle: () => [
      { topic: 'settings', title: 'Ok settings' },
      { topic: 'usage', title: 'Using ok' },
    ],
  });
  ctx.registerQuery('okdocs.docs.get', {
    description: 'Reads one ok guide.',
    public: true,
    input: z.object({ topic: z.string() }),
    output: page,
    handle: (input) => {
      const titles = { settings: 'Ok settings', usage: 'Using ok' };
      const title = titles[input.topic];
      if (title === undefined) throw new ProblemError({ code: 'NOT_FOUND', message: 'okdocs has no docs on ' + input.topic + '.' });
      return { topic: input.topic, title, markdown: '# ' + title + '\\n\\nThe ' + title + ' page.\\n' };
    },
  });
};
`;

const listBrokenEntry = `import { z } from '@kvman/sdk';

export default (ctx) => {
  ctx.registerQuery('listbroken.docs.list', {
    description: 'Lists the broken guides.',
    public: true,
    retries: 0,
    input: z.object({}),
    output: z.array(z.strictObject({ topic: z.string(), title: z.string() })),
    handle: () => {
      throw new Error('listbroken docs are broken');
    },
  });
  ctx.registerQuery('listbroken.docs.get', {
    description: 'Reads one broken guide.',
    public: true,
    input: z.object({ topic: z.string() }),
    output: z.strictObject({ topic: z.string(), title: z.string(), markdown: z.string() }),
    handle: (input) => ({ topic: input.topic, title: 'Broken', markdown: '# Broken\\n' }),
  });
};
`;

const badShapeEntry = `import { z } from '@kvman/sdk';

export default (ctx) => {
  ctx.registerQuery('badshape.docs.list', {
    description: 'Lists the misshapen guides.',
    public: true,
    input: z.object({}),
    output: z.json(),
    handle: () => ({ not: 'a list' }),
  });
  ctx.registerQuery('badshape.docs.get', {
    description: 'Reads one misshapen guide.',
    public: true,
    input: z.object({ topic: z.string() }),
    output: z.strictObject({ topic: z.string(), title: z.string(), markdown: z.string() }),
    handle: (input) => ({ topic: input.topic, title: 'Misshapen', markdown: '# Misshapen\\n' }),
  });
};
`;

const privateEntry = `import { z } from '@kvman/sdk';

export default (ctx) => {
  ctx.registerQuery('hidden.docs.list', {
    description: 'Lists the hidden guides.',
    input: z.object({}),
    output: z.array(z.strictObject({ topic: z.string(), title: z.string() })),
    handle: () => [{ topic: 'usage', title: 'Using hidden' }],
  });
  ctx.registerQuery('hidden.docs.get', {
    description: 'Reads one hidden guide.',
    input: z.object({ topic: z.string() }),
    output: z.strictObject({ topic: z.string(), title: z.string(), markdown: z.string() }),
    handle: (input) => ({ topic: input.topic, title: 'Hidden', markdown: '# Hidden\\n' }),
  });
};
`;

const halfEntry = `import { z } from '@kvman/sdk';

export default (ctx) => {
  ctx.registerQuery('half.docs.list', {
    description: 'Lists the half guides.',
    public: true,
    input: z.object({}),
    output: z.array(z.strictObject({ topic: z.string(), title: z.string() })),
    handle: () => [{ topic: 'usage', title: 'Using half' }],
  });
};
`;

const webHomeEntry = `export default () => {};
`;

type Fixture = { folder: string; name: string; namespace: string; entry: string; web?: boolean };

const fixtures: Fixture[] = [
  { folder: 'ok', name: '@fix/ok', namespace: 'okdocs', entry: okEntry },
  { folder: 'listbroken', name: '@fix/listbroken', namespace: 'listbroken', entry: listBrokenEntry },
  { folder: 'badshape', name: '@fix/badshape', namespace: 'badshape', entry: badShapeEntry },
  { folder: 'private', name: '@fix/private', namespace: 'hidden', entry: privateEntry },
  { folder: 'half', name: '@fix/half', namespace: 'half', entry: halfEntry },
  { folder: 'webhome', name: '@fix/webhome', namespace: 'webhome', entry: webHomeEntry, web: true },
];

// Writes every fixture extension under `folder` and returns the preset `extensions` entries.
export function writeDocsFixtures(folder: string): Record<string, string> {
  const extensions: Record<string, string> = {};
  for (const fixture of fixtures) {
    const extensionFolder = path.join(folder, fixture.folder);
    mkdirSync(extensionFolder, { recursive: true });
    const kvman = fixture.web === true ? { namespace: fixture.namespace, web: 'web' } : { namespace: fixture.namespace };
    const manifest = { name: fixture.name, version: '0.1.0', type: 'module', main: 'index.js', peerDependencies: { '@kvman/sdk': '^0.1.0' }, kvman };
    writeFileSync(path.join(extensionFolder, 'package.json'), `${JSON.stringify(manifest, undefined, 2)}\n`);
    writeFileSync(path.join(extensionFolder, 'index.js'), fixture.entry);
    if (fixture.web === true) {
      mkdirSync(path.join(extensionFolder, 'web'), { recursive: true });
      writeFileSync(path.join(extensionFolder, 'web', 'index.html'), '<!doctype html><title>x</title>');
    }
    extensions[fixture.name] = `path:${extensionFolder}`;
  }
  return extensions;
}

// Writes a preset of the given extensions (one worker, `kernel.web.home` the webhome fixture) and returns its path.
export function writeDocsPreset(folder: string, extensions: Record<string, string>): string {
  const preset = { name: 'docs-test', extensions, settings: { 'kernel.web.home': 'webhome', 'kernel.workers': 1 } };
  const file = path.join(folder, 'preset.json');
  writeFileSync(file, `${JSON.stringify(preset, undefined, 2)}\n`);
  return file;
}
