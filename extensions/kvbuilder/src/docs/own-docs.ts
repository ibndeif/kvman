import { fileURLToPath } from 'node:url';
import { z, type Ctx } from '@kvman/sdk';
import { listPages, noSuchTopic, readPage } from './pages.ts';

// kvcustomizer's own docs pair (plan 09 §9.5, ADR 0010, 22): the pages in its `docs/` folder, except `init.md`, which
// is the text `kvman init` returns (ADR 0023). The folder sits next to `src/` and `dist/`.

const docsFolder = fileURLToPath(new URL('../../docs/', import.meta.url));

const notPages = ['init'] as const;

/** The text `kvman init` returns (`docs/init.md`). */
export function readInstructions(): string {
  const page = readPage(docsFolder, 'init');
  if (page === undefined) throw new Error('docs/init.md is missing.');
  return page.markdown;
}

export function registerOwnDocs(ctx: Ctx): void {
  ctx.registerQuery('kvcustomizer.docs.list', {
    description: 'Lists the documentation pages of kvcustomizer.',
    public: true,
    input: z.object({}),
    output: z.array(z.object({ topic: z.string(), title: z.string() })),
    handle: () => listPages(docsFolder, notPages),
  });
  ctx.registerQuery('kvcustomizer.docs.get', {
    description: 'Gives one documentation page of kvcustomizer.',
    public: true,
    input: z.object({ topic: z.string().describe('The page topic, such as customizing.') }),
    output: z.object({ topic: z.string(), title: z.string(), markdown: z.string() }),
    handle: (input) => {
      const page = readPage(docsFolder, input.topic, notPages);
      if (page === undefined) throw noSuchTopic(input.topic, 'kvcustomizer');
      return page;
    },
  });
}
