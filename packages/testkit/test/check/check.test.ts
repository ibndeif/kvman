import { describe, expect, it } from 'vitest';
import { checkExtension } from '../../src/check/check-extension.ts';
import { readableFindings } from '../../src/check/check-output.ts';
import { cleanSource, useProjects } from './projects.ts';

const project = useProjects();

describe('kvman-check (09 §9.2, ADR 0009, 116)', () => {
  it('M2.5-E16 a clean extension gives no findings', async () => {
    const findings = await checkExtension(project({ source: cleanSource }));
    expect(findings).toEqual([]);
    expect(readableFindings(findings)).toBe('kvman-check: no findings.');
  });

  it('M2.5-E17 a registration with no description, or a name outside the namespace, is one finding from the refused load', async () => {
    const missing = await checkExtension(project({ source: cleanSource.replace("description: 'Gives the greeting.', ", '') }));
    expect(missing).toEqual([{ message: expect.stringMatching(/^The extension doesn't load: .*notes\.greeting\.get.*description/s), hint: expect.any(String), warning: false }]);
    const outside = await checkExtension(project({ source: cleanSource.replace("'notes.greeting.get', { description", "'other.greeting.get', { description") }));
    expect(outside).toEqual([{ message: expect.stringMatching(/^The extension doesn't load: .*other\.greeting\.get/s), hint: expect.any(String), warning: false }]);
    expect(readableFindings(outside)).toMatch(/kvman-check: 1 error\(s\), 0 warning\(s\)\.$/);
  });

  it('M2.5-E18 a public input field with no description is a finding; a private one is not', async () => {
    const source = cleanSource.replace(
      '};\n',
      `  ctx.registerCommand('notes.note.add', { description: 'Adds a note.', public: true, input: z.object({ text: z.string(), tags: z.array(z.string()).describe('Its tags.') }), output: z.null(), handle: () => null });
  ctx.registerCommand('notes.note.tidy', { description: 'Tidies notes.', input: z.object({ depth: z.number() }), output: z.null(), handle: () => null });
};\n`,
    );
    expect(await checkExtension(project({ source }))).toEqual([
      { message: 'The input field text of notes.note.add has no description.', hint: expect.stringContaining(".describe('…')"), warning: false },
    ]);
  });
});
