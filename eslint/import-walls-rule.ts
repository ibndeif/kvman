import type { Rule } from 'eslint';
import { checkImport } from './walls.ts';
import { readWorkspace, unitOf } from './workspace.ts';

function isTypeOnly(node: Rule.Node): boolean {
  return ('importKind' in node && node.importKind === 'type') || ('exportKind' in node && node.exportKind === 'type');
}

export const importWallsRule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: { description: 'Enforces the import walls of plan 01 §1.4.' },
    schema: [],
    messages: { wall: '{{ reason }}' },
  },
  create(context) {
    const workspace = readWorkspace(context.cwd);
    const unit = unitOf(workspace, context.filename);
    if (unit === undefined) return {};
    const check = (node: Rule.Node, specifier: unknown): void => {
      if (typeof specifier !== 'string') return;
      const reason = checkImport(workspace, unit, { specifier, typeOnly: isTypeOnly(node), fromFile: context.filename });
      if (reason !== undefined) context.report({ node, messageId: 'wall', data: { reason } });
    };
    return {
      ImportDeclaration(node) {
        check(node, node.source.value);
      },
      ExportNamedDeclaration(node) {
        if (node.source) check(node, node.source.value);
      },
      ExportAllDeclaration(node) {
        check(node, node.source.value);
      },
      ImportExpression(node) {
        if (node.source.type === 'Literal') check(node, node.source.value);
      },
    };
  },
};
