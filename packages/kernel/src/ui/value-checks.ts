import type { ErrorObject } from 'ajv';
import { isBindingText, type Issue, type Json, type JsonObject } from '@kvman/protocol';
import type { PayloadValidators } from '../router/payload-validators.ts';

const interpolation = /\{\{[^{}]*\}\}/;

// Checks a value holding bindings against a JSON Schema. Only the kernel process has one (it needs Ajv); the install
// loader's sandbox reads no more than the kernel, protocol, SDK, and Zod, so its recording skips value checks and the
// stage pipeline runs them on the recorded manifest.
export type ValueChecker = (check: ValueCheck) => Issue[];

export type ValueCheck = {
  schema: JsonObject;
  value: Json;
  // Issue paths start here, e.g. `ui.pages.0.view.children.1.onClick.payload`.
  root: string;
  // A command action with `form` leaves its missing fields to the generated form (ADR 0157).
  missingAllowed?: boolean;
};

// A binding or an interpolated string stands for a value known only at render (ADR 0157).
export function isBound(value: Json | undefined): boolean {
  return typeof value === 'string' && (isBindingText(value) || interpolation.test(value));
}

function pointerSegments(pointer: string): string[] {
  return pointer === '' ? [] : pointer.slice(1).split('/').map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'));
}

function childOf(value: Json | undefined, key: string): Json | undefined {
  if (Array.isArray(value)) return value[Number(key)];
  if (value !== null && typeof value === 'object') return value[key];
  return undefined;
}

function underBinding(value: Json, instancePath: string): boolean {
  let current: Json | undefined = value;
  if (isBound(current)) return true;
  for (const key of pointerSegments(instancePath)) {
    current = childOf(current, key);
    if (isBound(current)) return true;
  }
  return false;
}

function isUnion(error: ErrorObject): boolean {
  return error.keyword === 'anyOf' || error.keyword === 'oneOf';
}

// The errors Ajv reports for the branches of a failed union, before the union's own error.
function branchErrors(errors: readonly ErrorObject[], union: ErrorObject): ErrorObject[] {
  return errors.filter((error) => error !== union
    && error.schemaPath.startsWith(`${union.schemaPath}/`) && error.instancePath.startsWith(union.instancePath));
}

// Errors not inside a failed union of the same list: a union speaks for its branches.
function outermost(errors: readonly ErrorObject[]): ErrorObject[] {
  const inside = new Set(errors.filter(isUnion).flatMap((union) => branchErrors(errors, union)));
  return errors.filter((error) => !inside.has(error));
}

function branchesOf(errors: readonly ErrorObject[], union: ErrorObject): ErrorObject[][] {
  const branches = new Map<string, ErrorObject[]>();
  for (const error of branchErrors(errors, union)) {
    const index = error.schemaPath.slice(union.schemaPath.length + 1).split('/')[0] ?? '';
    branches.set(index, [...(branches.get(index) ?? []), error]);
  }
  return [...branches.values()];
}

function issuePath(root: string, error: ErrorObject): string {
  const property = error.params['missingProperty'] ?? error.params['additionalProperty'];
  const named = typeof property === 'string' ? [property] : [];
  return [...(root === '' ? [] : [root]), ...pointerSegments(error.instancePath), ...named].join('.');
}

// Without a checker (inside the install loader) values are not checked here; the stage pipeline checks them.
export function checkValue(values: ValueChecker | undefined, check: ValueCheck): Issue[] {
  return values === undefined ? [] : values(check);
}

export function ajvValueChecker(validators: PayloadValidators): ValueChecker {
  return (check) => valueIssues(validators, check);
}

// Validates a value holding bindings: an error on a bound value is dropped, and a union passes when one of its
// branches fails only on bound values. A oneOf that more than one branch matched stays an error.
export function valueIssues(validators: PayloadValidators, check: ValueCheck): Issue[] {
  const validate = validators.validatorFor(check.schema);
  if (validate(check.value)) return [];
  const excused = (error: ErrorObject, errors: readonly ErrorObject[]): boolean => {
    if (underBinding(check.value, error.instancePath)) return true;
    if (error.keyword === 'required' && error.instancePath === '' && check.missingAllowed === true) return true;
    if (!isUnion(error) || Array.isArray(error.params['passingSchemas'])) return false;
    return branchesOf(errors, error).some((branch) => outermost(branch).every((inner) => excused(inner, branch)));
  };
  const errors = validate.errors ?? [];
  return outermost(errors)
    .filter((error) => !excused(error, errors))
    .map((error) => ({ path: issuePath(check.root, error), message: error.message ?? 'does not match the schema' }));
}
