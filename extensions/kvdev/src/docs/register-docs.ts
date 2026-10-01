import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z, type Ctx } from '@kvman/sdk';

// The `docs` connector (plan 09 §9.1, ADR 0009, 126): kvdev's guides, English Markdown for the model, in `docs/`.

export const docTopics = ['sdk', 'views', 'components', 'i18n', 'connectors', 'presets'] as const;

const docsFolder = fileURLToPath(new URL('../../docs/', import.meta.url));

export function readDoc(file: string): string {
  return readFileSync(`${docsFolder}${file}.md`, 'utf8');
}

export function registerDocs(ctx: Ctx): void {
  ctx.registerQuery('kvdev.docs.get', {
    description: 'Gives one of the kvman development guides as Markdown.',
    public: true,
    input: z.object({ topic: z.enum(docTopics).describe('The guide: sdk, views, components, i18n, connectors, or presets.') }),
    output: z.string(),
    handle: (input) => readDoc(input.topic),
  });
}
