// Evaluates the part of ffmpeg's expression language that kvvideo's camera writes (plan 16 §16.8): numbers, `+ - * /`,
// unary minus, brackets, the variables given, and the functions `if`, `lt`, `pow`, and `clip`.

const functions: Record<string, (...values: number[]) => number> = {
  if: (test = 0, yes = 0, no = 0) => (test === 0 ? no : yes),
  lt: (a = 0, b = 0) => (a < b ? 1 : 0),
  pow: (base = 0, power = 0) => base ** power,
  clip: (value = 0, low = 0, high = 0) => Math.min(Math.max(value, low), high),
};

export function evaluateExpression(expression: string, variables: Record<string, number>): number {
  const tokens = expression.match(/\d+(?:\.\d+)?|[A-Za-z_]+|[-+*/(),]/g) ?? [];
  let at = 0;
  const peek = (): string | undefined => tokens[at];
  const take = (): string => tokens[at++] ?? '';
  const primary = (): number => {
    const token = take();
    if (token === '(') {
      const value = sum();
      take();
      return value;
    }
    if (token === '-') return -primary();
    if (/^\d/.test(token)) return Number(token);
    if (peek() === '(') {
      take();
      const values = [sum()];
      while (peek() === ',') {
        take();
        values.push(sum());
      }
      take();
      const call = functions[token];
      if (call === undefined) throw new Error(`unknown function ${token}`);
      return call(...values);
    }
    const value = variables[token];
    if (value === undefined) throw new Error(`unknown variable ${token}`);
    return value;
  };
  const product = (): number => {
    let value = primary();
    while (peek() === '*' || peek() === '/') value = take() === '*' ? value * primary() : value / primary();
    return value;
  };
  const sum = (): number => {
    let value = product();
    while (peek() === '+' || peek() === '-') value = take() === '+' ? value + product() : value - product();
    return value;
  };
  return sum();
}
