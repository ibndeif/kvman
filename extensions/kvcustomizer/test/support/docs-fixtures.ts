import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Fixture extensions for the docs tests: small `path:` extensions in a folder, each with a package.json and an
// index.js. `ok` serves two pages; the others are the ways a docs pair can be wrong or missing.

export const fixtureNames = ['@fix/ok', '@fix/listbroken', '@fix/badshape', '@fix/private', '@fix/half'] as const;

const header = "import { ProblemError, z } from '@kvman/sdk';\n";

const entries: Record<(typeof fixtureNames)[number], { namespace: string; entry: string }> = {
  '@fix/ok': {
    namespace: 'okdocs',
    entry: `${header}
const pages = { usage: 'Using ok', settings: 'Ok settings' };
export default (ctx) => {
  ctx.registerQuery('okdocs.docs.list', {
    description: 'Lists the pages.', public: true, input: z.object({}),
    output: z.array(z.object({ topic: z.string(), title: z.string() })),
    handle: () => Object.entries(pages).map(([topic, title]) => ({ topic, title })),
  });
  ctx.registerQuery('okdocs.docs.get', {
    description: 'Gives a page.', public: true, input: z.object({ topic: z.string() }),
    output: z.object({ topic: z.string(), title: z.string(), markdown: z.string() }),
    handle: (input) => {
      const title = pages[input.topic];
      if (title === undefined) throw new ProblemError({ code: 'NOT_FOUND', message: 'No page ' + input.topic + '.' });
      return { topic: input.topic, title, markdown: '# ' + title + '\\n\\nBody of ' + input.topic + '.\\n' };
    },
  });
};
`,
  },
  '@fix/listbroken': {
    namespace: 'listbroken',
    entry: `${header}
export default (ctx) => {
  ctx.registerQuery('listbroken.docs.list', {
    description: 'Breaks.', public: true, input: z.object({}), output: z.array(z.object({ topic: z.string() })),
    handle: () => { throw new Error('secret detail that must not leak'); },
  });
  ctx.registerQuery('listbroken.docs.get', {
    description: 'Gives a page.', public: true, input: z.object({ topic: z.string() }), output: z.json(), handle: () => ({}),
  });
};
`,
  },
  '@fix/badshape': {
    namespace: 'badshape',
    entry: `${header}
export default (ctx) => {
  ctx.registerQuery('badshape.docs.list', {
    description: 'Answers the wrong shape.', public: true, input: z.object({}), output: z.json(), handle: () => ({ not: 'a list' }),
  });
  ctx.registerQuery('badshape.docs.get', {
    description: 'Answers the wrong shape.', public: true, input: z.object({ topic: z.string() }), output: z.json(), handle: () => ({ not: 'a page' }),
  });
};
`,
  },
  '@fix/private': {
    namespace: 'hidden',
    entry: `${header}
export default (ctx) => {
  ctx.registerQuery('hidden.docs.list', { description: 'Private.', input: z.object({}), output: z.json(), handle: () => [{ topic: 'x', title: 'X' }] });
  ctx.registerQuery('hidden.docs.get', { description: 'Private.', input: z.object({ topic: z.string() }), output: z.json(), handle: () => ({}) });
};
`,
  },
  '@fix/half': {
    namespace: 'half',
    entry: `${header}
export default (ctx) => {
  ctx.registerQuery('half.docs.list', { description: 'Only a list.', public: true, input: z.object({}), output: z.json(), handle: () => [{ topic: 'x', title: 'X' }] });
};
`,
  },
};

/** Writes the fixtures under `root` and returns their folders, in the order of `fixtureNames`. */
export function writeDocsFixtures(root: string): string[] {
  return fixtureNames.map((name) => {
    const { namespace, entry } = entries[name];
    const folder = path.join(root, namespace);
    mkdirSync(folder, { recursive: true });
    const manifest = { name, version: '0.1.0', type: 'module', main: 'index.js', peerDependencies: { '@kvman/sdk': '^0.1.0' }, kvman: { namespace } };
    writeFileSync(path.join(folder, 'package.json'), JSON.stringify(manifest));
    writeFileSync(path.join(folder, 'index.js'), entry);
    return folder;
  });
}
