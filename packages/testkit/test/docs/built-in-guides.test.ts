import { describe, expect, it } from 'vitest';
import { listBuiltInGuides, readBuiltInGuide } from '../../src/docs/built-in-guides.ts';

const mentions = [
  '<namespace>.<segment>',
  'imperative verb',
  '`add`',
  '`run`',
  'read verb',
  '`get`',
  '`list`',
  '<namespace>/UPPER_SNAKE',
  'execAsync',
  'ctx.schedule',
  'ctx.registerHandler',
  'scopes',
  '`en`',
  '`ar`',
  '<namespace>.ui.get',
  '<namespace>.docs.list',
];

describe('the built-in guides (09 §9.2, ADR 0030, 8)', () => {
  it('QA42-H18 conventions is a built-in guide, and it names every convention', () => {
    expect(listBuiltInGuides().map((guide) => guide.topic)).toEqual(['conventions', 'i18n', 'presets', 'sdk']);
    const guide = readBuiltInGuide('conventions');
    if (guide === undefined) throw new Error('The conventions guide is missing.');
    expect(guide).toMatchObject({ extension: 'kvman', topic: 'conventions', title: 'Conventions' });
    for (const mention of mentions) expect(guide.markdown, mention).toContain(mention);
  });
});
