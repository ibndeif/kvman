import { fileURLToPath } from 'node:url';
import { z, type Ctx } from '@kvman/sdk';
import { listPages, noSuchTopic, readPage } from './pages.ts';

// kvbuilder's own docs pair (plan 09 §9.5, ADR 0010, 22): the pages in its `docs/` folder, except `guide.md`, which
// is the section `/build-kvman` sets in a chat (ADR 0027, 12 and 13). The folder sits next to `src/` and `dist/`.

const docsFolder = fileURLToPath(new URL('../../docs/', import.meta.url));

const notPages = ['guide'] as const;

/** The guide `/build-kvman` gives a chat (`docs/guide.md`). */
export function readGuide(): string {
  const page = readPage(docsFolder, 'guide');
  if (page === undefined) throw new Error('docs/guide.md is missing.');
  return page.markdown;
}

export function registerOwnDocs(ctx: Ctx): void {
  ctx.registerQuery('kvbuilder.docs.list', {
    description: 'Lists the documentation pages of kvbuilder.',
    public: true,
    input: z.object({}),
    output: z.array(z.object({ topic: z.string(), title: z.string() })),
    handle: () => listPages(docsFolder, notPages),
  });
  ctx.registerQuery('kvbuilder.docs.get', {
    description: 'Gives one documentation page of kvbuilder.',
    public: true,
    input: z.object({ topic: z.string().describe('The page topic, such as building.') }),
    output: z.object({ topic: z.string(), title: z.string(), markdown: z.string() }),
    handle: (input) => {
      const page = readPage(docsFolder, input.topic, notPages);
      if (page === undefined) throw noSuchTopic(input.topic, 'kvbuilder');
      return page;
    },
  });
}
