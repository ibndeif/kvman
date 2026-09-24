import type { FieldCondition, Filter, FilterOperators, FilterScalar } from '@kvman/protocol';
import type { SqlValue } from '../storage/driver.ts';
import { fieldExpressions, type FieldExpressions } from './sql-paths.ts';

export type SqlFragment = { sql: string; params: SqlValue[] };

const numberTypes = "('integer', 'real')";

function fragment(sql: string, params: SqlValue[] = []): SqlFragment {
  return { sql, params };
}

function join(parts: SqlFragment[], operator: 'AND' | 'OR', empty: string): SqlFragment {
  if (parts.length === 0) return fragment(empty);
  return fragment(`(${parts.map((part) => part.sql).join(` ${operator} `)})`, parts.flatMap((part) => part.params));
}

function typedEquals(type: string, value: string, operand: FilterScalar): SqlFragment {
  if (operand === null) return fragment(`(${type} IS NULL OR ${type} = 'null')`);
  if (typeof operand === 'boolean') return fragment(`${type} = '${operand ? 'true' : 'false'}'`);
  if (typeof operand === 'number') return fragment(`(${type} IN ${numberTypes} AND ${value} = ?)`, [operand]);
  return fragment(`(${type} = 'text' AND ${value} = ?)`, [operand]);
}

function ordered(field: FieldExpressions, operator: '>' | '>=' | '<' | '<=', operand: number | string): SqlFragment {
  const types = typeof operand === 'number' ? `${field.type} IN ${numberTypes}` : `${field.type} = 'text'`;
  return fragment(`(${types} AND ${field.value} ${operator} ?)`, [operand]);
}

function inList(field: FieldExpressions, list: FilterScalar[]): SqlFragment {
  const scalar = join(list.map((operand) => typedEquals(field.type, field.value, operand)), 'OR', '0');
  const element = join(list.map((operand) => typedEquals('element.type', 'element.value', operand)), 'OR', '0');
  return fragment(
    `(CASE WHEN ${field.type} = 'array' THEN EXISTS (SELECT 1 FROM json_each(data, ${field.path}) AS element WHERE ${element.sql}) ELSE ${scalar.sql} END)`,
    [...element.params, ...scalar.params],
  );
}

function operatorsSql(field: FieldExpressions, operators: FilterOperators): SqlFragment {
  const parts: SqlFragment[] = [];
  if (operators.eq !== undefined) parts.push(typedEquals(field.type, field.value, operators.eq));
  if (operators.ne !== undefined) {
    const equals = typedEquals(field.type, field.value, operators.ne);
    parts.push(fragment(`NOT COALESCE(${equals.sql}, 0)`, equals.params));
  }
  if (operators.gt !== undefined) parts.push(ordered(field, '>', operators.gt));
  if (operators.gte !== undefined) parts.push(ordered(field, '>=', operators.gte));
  if (operators.lt !== undefined) parts.push(ordered(field, '<', operators.lt));
  if (operators.lte !== undefined) parts.push(ordered(field, '<=', operators.lte));
  if (operators.in !== undefined) parts.push(inList(field, operators.in));
  if (operators.prefix !== undefined) {
    parts.push(fragment(`(${field.type} = 'text' AND substr(${field.value}, 1, length(?)) = ?)`, [operators.prefix, operators.prefix]));
  }
  if (operators.exists !== undefined) {
    parts.push(fragment(operators.exists ? `(${field.type} IS NOT NULL AND ${field.type} != 'null')` : `(${field.type} IS NULL OR ${field.type} = 'null')`));
  }
  return join(parts, 'AND', '1');
}

function conditionSql(path: string, condition: FieldCondition): SqlFragment {
  const field = fieldExpressions(path);
  if (condition !== null && typeof condition === 'object') return operatorsSql(field, condition);
  return typedEquals(field.type, field.value, condition);
}

export function filterSql(filter: Filter): SqlFragment {
  const parts = Object.entries(filter).flatMap(([path, condition]): SqlFragment[] => {
    if (condition === undefined) return [];
    if (Array.isArray(condition)) return [join(condition.map(filterSql), 'OR', '0')];
    return [conditionSql(path, condition)];
  });
  return join(parts, 'AND', '1');
}

function rankSql(type: string): string {
  return `CASE WHEN ${type} IS NULL OR ${type} = 'null' THEN 0 WHEN ${type} = 'false' THEN 1 WHEN ${type} = 'true' THEN 2 `
    + `WHEN ${type} IN ${numberTypes} THEN 3 WHEN ${type} = 'text' THEN 4 ELSE 5 END`;
}

export function orderBySql(orderBy: ReadonlyArray<readonly [string, 'asc' | 'desc']>): string {
  const terms = orderBy.flatMap(([path, direction]) => {
    const field = fieldExpressions(path);
    const sqlDirection = direction === 'asc' ? 'ASC' : 'DESC';
    return [`${rankSql(field.type)} ${sqlDirection}`, `CASE WHEN ${field.type} IN ('integer', 'real', 'text') THEN ${field.value} END ${sqlDirection}`];
  });
  return [...terms, 'id ASC'].join(', ');
}
