// A type pattern is an exact type or "<prefix>.*", which matches every type under that prefix (05 §5.7).
export function matchesTypePattern(pattern: string, type: string): boolean {
  return pattern.endsWith('.*') ? type.startsWith(pattern.slice(0, -1)) : pattern === type;
}
