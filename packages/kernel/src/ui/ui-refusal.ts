import type { Issue, JsonObject, Manifest, Preset, Problem } from '@kvman/protocol';
import { kernelProblem } from '../problems.ts';
import type { KernelRegistry } from '../registry/kernel-registry.ts';
import { PayloadValidators } from '../router/payload-validators.ts';
import { pageUiIssues, workspaceUiCheck, type UiCheck } from './ui-checks.ts';
import { ajvValueChecker } from './value-checks.ts';

// The kernel process's value checker for views (ADR 0157).
export const kernelValues = ajvValueChecker(new PayloadValidators());
const values = kernelValues;

// ADR 0157: the UI checks of a workspace whose enabled set would be `enabled`, with its preset; `presetChecks` where the
// preset itself is written or validated.
export function workspaceUi(registry: KernelRegistry, enabled: readonly Manifest[], preset: Preset | undefined, presetChecks: boolean): UiCheck {
  return workspaceUiCheck({ enabled, installed: registry.listed(undefined), preset, values, presetChecks });
}

export function workspacePageIssues(registry: KernelRegistry, enabled: readonly Manifest[], preset: Preset | undefined, page: JsonObject): Issue[] {
  return pageUiIssues({ enabled, installed: registry.listed(undefined), preset, values, presetChecks: false }, page);
}

// A failed UI check as the reply: its code, the first error as the detail, and every error as issues.
export function uiProblem(check: UiCheck, context: { correlationId: string; messageId?: string }): Problem | undefined {
  if (check.code === undefined) return undefined;
  const errors = check.issues.filter((issue) => issue.severity !== 'warning');
  const [first] = errors;
  return kernelProblem(check.code, {
    ...context, detail: first === undefined ? 'the UI does not validate' : `${first.path}: ${first.message}`, issues: errors,
    ...(first?.hint === undefined ? {} : { hint: first.hint }),
  });
}
