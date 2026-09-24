import { compareByCodePoint } from '../unicode.ts';
import type { FieldCondition, Filter, FilterOperators, FilterScalar } from './filter-schema.ts';

export type PathResolver = (path: string) => unknown;

const arrayIndexPattern = /^(?:0|[1-9][0-9]*)$/;

export function readPath(root: unknown, path: string): unknown {
  let current = root;
  for (const segment of path.split('.')) {
    if (Array.isArray(current) && arrayIndexPattern.test(segment)) current = current[Number(segment)];
    else if (current !== null && typeof current === 'object' && !Array.isArray(current) && Object.hasOwn(current, segment)) {
      current = Reflect.get(current, segment);
    } else return undefined;
  }
  return current;
}

function isMissing(value: unknown): boolean {
  return value === undefined || value === null;
}

function equals(value: unknown, operand: FilterScalar): boolean {
  return operand === null ? isMissing(value) : value === operand;
}

function compare(value: unknown, operand: number | string): number | undefined {
  if (typeof value === 'number' && typeof operand === 'number') return value - operand;
  if (typeof value === 'string' && typeof operand === 'string') return compareByCodePoint(value, operand);
  return undefined;
}

function comparesAs(value: unknown, operand: number | string | undefined, accept: (order: number) => boolean): boolean {
  if (operand === undefined) return true;
  const order = compare(value, operand);
  return order !== undefined && accept(order);
}

function isInList(value: unknown, list: FilterScalar[]): boolean {
  const candidates: unknown[] = Array.isArray(value) ? value : [value];
  return candidates.some((candidate) => list.some((operand) => equals(candidate, operand)));
}

function matchesOperators(value: unknown, operators: FilterOperators): boolean {
  return (
    (operators.eq === undefined || equals(value, operators.eq)) &&
    (operators.ne === undefined || !equals(value, operators.ne)) &&
    comparesAs(value, operators.gt, (order) => order > 0) &&
    comparesAs(value, operators.gte, (order) => order >= 0) &&
    comparesAs(value, operators.lt, (order) => order < 0) &&
    comparesAs(value, operators.lte, (order) => order <= 0) &&
    (operators.in === undefined || isInList(value, operators.in)) &&
    (operators.prefix === undefined || (typeof value === 'string' && value.startsWith(operators.prefix))) &&
    (operators.exists === undefined || operators.exists === !isMissing(value))
  );
}

function matchesCondition(value: unknown, condition: FieldCondition): boolean {
  if (condition !== null && typeof condition === 'object') return matchesOperators(value, condition);
  return equals(value, condition);
}

export function evaluateFilter(filter: Filter, resolve: PathResolver): boolean {
  return Object.entries(filter).every(([path, condition]) => {
    if (condition === undefined) return true;
    if (Array.isArray(condition)) return condition.some((alternative) => evaluateFilter(alternative, resolve));
    return matchesCondition(resolve(path), condition);
  });
}

export function matchesDocument(document: unknown, filter: Filter): boolean {
  return evaluateFilter(filter, (path) => readPath(document, path));
}
