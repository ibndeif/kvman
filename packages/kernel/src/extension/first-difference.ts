import type { Json } from '@kvman/protocol';

function isObject(value: Json): value is { [key: string]: Json } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function join(path: string, key: string | number): string {
  return path === '' ? String(key) : `${path}.${key}`;
}

// The path of the first place where two JSON values differ, in sorted key order, or undefined when they are equal.
export function firstDifference(left: Json, right: Json, path = ''): string | undefined {
  if (Array.isArray(left) && Array.isArray(right)) {
    for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
      const leftItem = left[index];
      const rightItem = right[index];
      if (leftItem === undefined || rightItem === undefined) return join(path, index);
      const difference = firstDifference(leftItem, rightItem, join(path, index));
      if (difference !== undefined) return difference;
    }
    return undefined;
  }
  if (isObject(left) && isObject(right)) {
    for (const key of [...new Set([...Object.keys(left), ...Object.keys(right)])].sort()) {
      const leftMember = left[key];
      const rightMember = right[key];
      if (leftMember === undefined || rightMember === undefined) return join(path, key);
      const difference = firstDifference(leftMember, rightMember, join(path, key));
      if (difference !== undefined) return difference;
    }
    return undefined;
  }
  return left === right ? undefined : path;
}
