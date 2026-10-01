import { describe, expect, it } from 'vitest';
import { checkExtension } from '../../src/check/check-extension.ts';
import { scanTimers } from '../../src/check/timer-scan.ts';
import { cleanSource, useProjects } from './projects.ts';

const project = useProjects();

describe('timer warnings (02 §2.2, ADR 0009, 116)', () => {
  it('M2.5-E20 setInterval and an unawaited setTimeout warn; an awaited one, and one in a comment or a string, do not', () => {
    const source = [
      "const ticks = setInterval(() => {}, 1000);",
      'setTimeout(() => {}, 5);',
      'await new Promise((resolve) => setTimeout(resolve, 5));',
      '// setInterval(() => {}, 1);',
      "/* setTimeout(() => {}, 1); */ const text = 'setInterval(';",
    ].join('\n');
    expect(scanTimers('src/index.ts', source)).toEqual([
      { file: 'src/index.ts:1:15', message: 'Warning: setInterval keeps running after the handler returns.', hint: expect.any(String), warning: true },
      { file: 'src/index.ts:2:1', message: 'Warning: an unawaited setTimeout outlives its handler.', hint: expect.any(String), warning: true },
    ]);
  });

  it('M2.5-E20 warnings alone are findings that do not fail the check', async () => {
    const source = cleanSource.replace("handle: () => ({ text: 'Hello from notes!' })", "handle: () => { setTimeout(() => {}, 1); return { text: 'Hello from notes!' }; }");
    const findings = await checkExtension(project({ source }));
    expect(findings).toEqual([expect.objectContaining({ file: expect.stringMatching(/^src\/index\.ts:4:\d+$/), warning: true })]);
    expect(findings.some((finding) => !finding.warning)).toBe(false);
  });
});
