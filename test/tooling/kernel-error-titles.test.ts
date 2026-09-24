import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { kernelErrors } from '../../packages/protocol/src/index.ts';
import { repositoryRoot } from './repository.ts';

function planCatalogRows(): string[][] {
  const plan = readFileSync(path.join(repositoryRoot, 'plan/13-errors-observability-security.md'), 'utf8');
  const section = plan.slice(plan.indexOf('## 13.2'), plan.indexOf('## 13.3'));
  return section.split('\n').filter((line) => line.startsWith('| `')).map((line) => line.slice(2, -2).split(' | '));
}

describe('kernel error titles (plan 13 §13.2, ADR 0022)', () => {
  it('M0.2-E42 the plan and the protocol constants agree', () => {
    const planned = new Map<string, { title: string; retryable: string }>();
    for (const [codes = '', , titles = '', retryable = ''] of planCatalogRows()) {
      const codeList = [...codes.matchAll(/`([A-Z][A-Z0-9_]+)`/g)].map((match) => match[1] ?? '').filter((code) => code in kernelErrors);
      const titleList = titles.split(' / ');
      codeList.forEach((code, index) => planned.set(code, { title: titleList[index] ?? '', retryable }));
    }
    expect([...planned.keys()].sort()).toEqual(Object.keys(kernelErrors).sort());
    for (const [code, definition] of Object.entries(kernelErrors)) {
      const row = planned.get(code);
      expect(row?.title, code).toBe(definition.title);
      if (row?.retryable === 'no') expect(definition.retryable, code).toBe(false);
    }
  });
});
