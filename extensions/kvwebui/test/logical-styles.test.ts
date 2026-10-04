import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const pagesFolder = fileURLToPath(new URL('../web/src/components/pages/', import.meta.url));

describe('the Extensions page components (06 §6.6, CLAUDE.md §5)', () => {
  it('QA17-E19 the components use logical styles only, with no physical left or right', () => {
    for (const file of ['AddExtension.vue', 'RemoveExtension.vue', 'PendingExtensionCard.vue', 'ExtensionCard.vue', 'ExtensionsPage.vue']) {
      const source = readFileSync(`${pagesFolder}${file}`, 'utf8');
      expect(source, file).not.toMatch(/(?:^|[\s"'])(?:ml|mr|pl|pr|left|right|border-l|border-r|rounded-l|rounded-r|text-left|text-right)(?:-|["'\s])/);
    }
  });
});
