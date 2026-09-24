import { z } from 'zod';
import type { Issue } from '../problem.ts';
import { builtinComponents } from './component-catalog.ts';
import type { ComponentSpec } from './component-spec.ts';
import { forwardIssues } from './issues.ts';

export type ViewNode = { type: string; [prop: string]: unknown };

export type ViewPlacement = 'standalone' | 'child';

export type ViewContext = { placement: ViewPlacement; childrenNodeAllowed: boolean };

const childrenNodeType = 'children';
const extensionComponentPattern = /^(?=[a-z0-9-]{2,32}\.)[a-z][a-z0-9]*(?:-[a-z0-9]+)*\.[a-z][a-zA-Z0-9]*$/;

type Check = z.RefinementCtx;

function typeOf(node: unknown): string | undefined {
  if (node === null || typeof node !== 'object' || !('type' in node)) return undefined;
  return typeof node.type === 'string' ? node.type : undefined;
}

function childProblem(parent: string, rule: ComponentSpec['children'], child: string | undefined): string | undefined {
  if (child === undefined) return undefined;
  const parents = builtinComponents.get(child)?.parents;
  if (parents !== undefined && !parents.includes(parent)) return `${child} appears only inside ${parents.join(', ')}`;
  if (rule === 'none') return `${parent} takes no children`;
  if (rule !== 'any' && !rule.includes(child)) return `${parent} accepts only ${rule.join(', ')} as children`;
  return undefined;
}

function checkChildren(parent: string, spec: ComponentSpec | undefined, children: unknown, check: Check, context: ViewContext): void {
  const rule = spec?.children ?? 'any';
  const list = children === undefined ? [] : children;
  if (!Array.isArray(list)) {
    check.addIssue({ code: 'custom', path: ['children'], message: 'children is a list of view nodes' });
    return;
  }
  const { min, max } = spec?.childCount ?? {};
  if ((min !== undefined && list.length < min) || (max !== undefined && list.length > max)) {
    check.addIssue({ code: 'custom', path: ['children'], message: `${parent} takes ${min === max ? `exactly ${min}` : `${min ?? 0}–${max ?? 'any number of'}`} children` });
  }
  const childSchema = viewNodeSchemaFor({ ...context, placement: 'child' });
  list.forEach((child, index) => {
    const problem = childProblem(parent, rule, typeOf(child));
    if (problem !== undefined) check.addIssue({ code: 'custom', path: ['children', index], message: problem });
    forwardIssues(childSchema.safeParse(child), check, ['children', index]);
  });
}

function checkNode(node: ViewNode, check: Check, context: ViewContext): void {
  const { type, children, ...props } = node;
  if (type === childrenNodeType && !context.childrenNodeAllowed) {
    check.addIssue({ code: 'custom', path: ['type'], message: 'a children node appears only in a composite that declares children' });
  }
  const spec = builtinComponents.get(type);
  if (spec === undefined && !extensionComponentPattern.test(type)) {
    check.addIssue({ code: 'custom', path: ['type'], message: `"${type}" is not a built-in component or an extension component "<namespace>.<name>"` });
    return;
  }
  if (spec !== undefined) {
    if (context.placement === 'standalone' && spec.parents !== undefined) {
      check.addIssue({ code: 'custom', path: ['type'], message: `${type} appears only inside ${spec.parents.join(', ')}` });
    }
    forwardIssues(spec.props.safeParse(props), check, []);
  }
  checkChildren(type, spec, children, check, context);
}

const schemasByContext = new Map<string, z.ZodType<ViewNode>>();

export function viewNodeSchemaFor(context: ViewContext): z.ZodType<ViewNode> {
  const key = `${context.placement}:${context.childrenNodeAllowed}`;
  const known = schemasByContext.get(key);
  if (known !== undefined) return known;
  const schema = z.looseObject({ type: z.string().min(1) }).superRefine((node, check) => checkNode(node, check, context));
  schemasByContext.set(key, schema);
  return schema;
}

export const viewNodeSchema = viewNodeSchemaFor({ placement: 'standalone', childrenNodeAllowed: false });

export function compositeViewSchema(acceptsChildren: boolean): z.ZodType<ViewNode> {
  return viewNodeSchemaFor({ placement: 'standalone', childrenNodeAllowed: acceptsChildren });
}

export function validateViewNode(node: unknown, context: ViewContext): Issue[] {
  const result = viewNodeSchemaFor(context).safeParse(node);
  if (result.success) return [];
  return result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
}
