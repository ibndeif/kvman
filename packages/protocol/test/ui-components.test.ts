import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { actionPropSchema, builtinComponentSpecs, textPropSchema, validateViewNode } from '../src/index.ts';

const componentsOfPlan = [
  'page', 'stack', 'row', 'grid', 'split', 'section', 'card', 'tabs', 'tab', 'divider', 'slot', 'children',
  'text', 'heading', 'markdown', 'badge', 'stat', 'keyValue', 'progress', 'code', 'diff', 'json', 'image', 'notice', 'emptyState',
  'liveText', 'fileLink', 'table', 'list', 'thread', 'settingsSections', 'form', 'textInput', 'textArea', 'numberInput', 'select',
  'checkbox', 'switch', 'dateInput', 'upload', 'composer', 'button', 'actionGroup', 'menu', 'menuItem',
];

const inputControls = ['textInput', 'textArea', 'numberInput', 'select', 'checkbox', 'switch', 'dateInput', 'upload', 'composer'];

function issuesOf(node: unknown): string[] {
  return validateViewNode(node, { placement: 'standalone', childrenNodeAllowed: false }).map((issue) => `${issue.path}: ${issue.message}`);
}

describe('built-in components (plan 08 §8.8–§8.9, ADRs 0023, 0028, 0029)', () => {
  it('M0.4-H2 every spec example validates, and the specs cover 08 §8.8', () => {
    expect(builtinComponentSpecs.map((spec) => spec.name).sort()).toEqual([...componentsOfPlan].sort());
    for (const spec of builtinComponentSpecs) {
      expect(spec.since).toBe('2.0.0');
      expect(spec.description.length, spec.name).toBeGreaterThan(0);
      expect(spec.examples, spec.name).toHaveLength(1);
      const placement = spec.parents === undefined ? 'standalone' : 'child';
      for (const example of spec.examples) {
        expect(example.type).toBe(spec.name);
        expect(validateViewNode(example, { placement, childrenNodeAllowed: spec.name === 'children' }), spec.name).toEqual([]);
      }
    }
  });

  it('M0.4-E15 only text accepts the muted tone', () => {
    expect(issuesOf({ type: 'text', text: '$props.subtitle', tone: 'muted' })).toEqual([]);
    expect(issuesOf({ type: 'badge', text: '$item.status', tone: 'muted' })).toHaveLength(1);
  });

  it('M0.4-E16 z.text() and z.action() carry their format markers', () => {
    expect(z.toJSONSchema(textPropSchema)).toMatchObject({ format: 'kvman-text' });
    expect(z.toJSONSchema(actionPropSchema)).toMatchObject({ format: 'kvman-action' });
  });

  it('M0.4-E17 input controls take the input props; form does not', () => {
    const inputProps = { label: '$t.label', help: '$t.help', required: true, value: '$state.value', disabledIf: { '$state.locked': true } };
    for (const spec of builtinComponentSpecs.filter((candidate) => inputControls.includes(candidate.name))) {
      const [example] = spec.examples;
      expect(issuesOf({ ...example, ...inputProps }), spec.name).toEqual([]);
    }
    expect(issuesOf({ type: 'form', command: 'pdf.translate', label: '$t.label' })).toHaveLength(1);
  });
});
